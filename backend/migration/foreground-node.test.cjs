const test = require('node:test');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const helper = path.join(__dirname, 'foreground-node.ps1');
const keys = ['OFFICE_NODE_TEST_EXISTING', 'OFFICE_NODE_TEST_ABSENT', 'OFFICE_NODE_TEST_REMOVED'];
const windowsOnly = {skip:process.platform !== 'win32', timeout:20000};
const psLiteral = value => "'" + value.replace(/'/g, "''") + "'";

function fixture() {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'office foreground fixture '));
    const files = new Set();
    return {
        file(name, content) {
            const filename = path.join(folder, name);
            files.add(filename);
            if (content !== undefined) fs.writeFileSync(filename, content);
            return filename;
        },
        cleanup() {
            for (const filename of files) {
                if (fs.existsSync(filename)) fs.unlinkSync(filename);
            }
            fs.rmdirSync(folder);
        }
    };
}

function launch(script) {
    const env = {...process.env, OFFICE_NODE_TEST_EXISTING:'parent-value', OFFICE_NODE_TEST_REMOVED:'removed-parent-value'};
    delete env.OFFICE_NODE_TEST_ABSENT;
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {env, windowsHide:true});
    const output = {stdout:'', stderr:''};
    const listeners = new Set();
    child.stdout.on('data', chunk => {
        output.stdout += chunk;
        for (const listener of listeners) listener();
    });
    child.stderr.on('data', chunk => {output.stderr += chunk;});
    const done = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({...output, code, signal}));
    });
    return {
        child, done,
        waitFor(marker) {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => finish(new Error('Fixture output did not stream: ' + output.stdout + output.stderr)), 10000);
                function finish(error) {clearTimeout(timer);listeners.delete(check);error ? reject(error) : resolve();}
                function check() {if (output.stdout.includes(marker)) finish();}
                listeners.add(check);
                check();
                done.then(() => {if (!output.stdout.includes(marker)) finish(new Error('Fixture exited before producing ' + marker));}, finish);
            });
        }
    };
}

function scriptFor(childFile, extra = '') {
    return `$ErrorActionPreference='Stop'
. ${psLiteral(helper)}
${extra}
Invoke-OfficeNode -NodeExecutable ${psLiteral(process.execPath)} -ServerFile ${psLiteral(childFile)} -ServerEnvironment @{}
`;
}

function environmentScript(childFile, fail = false) {
    const restoration = `$restored=@{}
foreach($name in @(${keys.map(psLiteral).join(',')})) {$restored[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
[Console]::Out.WriteLine('RESTORED_ENV:' + ($restored | ConvertTo-Json -Compress))`;
    return `$ErrorActionPreference='Stop'
. ${psLiteral(helper)}
$childEnvironment=@{OFFICE_NODE_TEST_EXISTING='child-value';OFFICE_NODE_TEST_ABSENT='introduced-value';OFFICE_NODE_TEST_REMOVED=$null}
${fail ? 'try {' : ''}
Invoke-OfficeNode -NodeExecutable ${psLiteral(process.execPath)} -ServerFile ${psLiteral(childFile)} -ServerEnvironment $childEnvironment
${fail ? '} catch {\n' + restoration + '\nthrow\n}' : restoration}
`;
}

function jsonLine(output, prefix) {
    const line = output.split(/\r?\n/).find(value => value.startsWith(prefix));
    assert.ok(line, 'Missing ' + prefix + ' in fixture output');
    return JSON.parse(line.slice(prefix.length));
}

function environmentChild(exitCode = 0) {
    return `console.log('CHILD_ENV:' + JSON.stringify(Object.fromEntries(${JSON.stringify(keys)}.map(key => [key, process.env[key] ?? null]))));\nprocess.exit(${exitCode});\n`;
}

function assertEnvironment(output) {
    assert.deepEqual(jsonLine(output, 'CHILD_ENV:'), {
        OFFICE_NODE_TEST_EXISTING:'child-value',
        OFFICE_NODE_TEST_ABSENT:'introduced-value',
        OFFICE_NODE_TEST_REMOVED:null
    });
    assert.deepEqual(jsonLine(output, 'RESTORED_ENV:'), {
        OFFICE_NODE_TEST_EXISTING:'parent-value',
        OFFICE_NODE_TEST_ABSENT:null,
        OFFICE_NODE_TEST_REMOVED:'removed-parent-value'
    });
}

test('foreground launcher streams child output while the child is still running', windowsOnly, async () => {
    const files = fixture();
    const release = files.file('release child');
    const childFile = files.file('tiny child.cjs', `const fs=require('node:fs');
console.log('CHILD_READY');
const poll=setInterval(() => {
    if(fs.existsSync(${JSON.stringify(release)})) {clearInterval(poll);clearTimeout(deadline);console.log('CHILD_EXITING');}
},25);
const deadline=setTimeout(() => process.exit(9),15000);
`);
    const script = files.file('launch fixture.ps1', scriptFor(childFile));
    const run = launch(script);
    try {
        // The child cannot finish until this test receives its first log line.
        // A launcher that buffers logs until exit therefore fails this check.
        await run.waitFor('CHILD_READY');
        assert.equal(run.child.exitCode, null);
        fs.writeFileSync(release, 'continue');
        const result = await run.done;
        assert.equal(result.code, 0, result.stderr);
        assert.match(result.stdout, /CHILD_EXITING/);
    } finally {
        if (!fs.existsSync(release)) fs.writeFileSync(release, 'continue');
        await run.done;
        files.cleanup();
    }
});

test('launcher passes scoped environment to Node and restores prior and unset values', windowsOnly, async () => {
    const files = fixture();
    try {
        const childFile = files.file('environment child.cjs', environmentChild());
        const script = files.file('launch environment.ps1', environmentScript(childFile));
        const result = await launch(script).done;
        assert.equal(result.code, 0, result.stderr);
        assertEnvironment(result.stdout);
    } finally {files.cleanup();}
});

test('native failure surfaces its exit code and still restores the launcher environment', windowsOnly, async () => {
    const files = fixture();
    try {
        const childFile = files.file('failing child.cjs', environmentChild(23));
        const script = files.file('launch failure.ps1', environmentScript(childFile, true));
        const result = await launch(script).done;
        assert.notEqual(result.code, 0);
        assert.match(result.stderr, /Office server exited with code 23/);
        assertEnvironment(result.stdout);
    } finally {files.cleanup();}
});
