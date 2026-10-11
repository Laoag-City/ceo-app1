/* Personal dropdown preferences; assigning stations uses the existing Add form. */
(() => {
    const select = document.getElementById('disciplineSelect');
    const toggle = document.getElementById('manageTemplatesBtn');
    const editor = document.getElementById('templateEditor');
    const list = document.getElementById('quickAddTemplates');
    const form = document.getElementById('quickTemplateForm');
    const input = document.getElementById('newTemplateName');
    const feedback = document.getElementById('templateFeedback');
    let templates = [...select.options].filter(option => option.value).map(option => option.textContent.trim());
    let user;
    try { user = JSON.parse(sessionStorage.getItem('oboUser') || 'null'); } catch (_) {}
    const key = 'buildingQuickTemplates:v1:' + (user?.id || user?.username || 'local');
    const normalize = value => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (Array.isArray(saved) && saved.every(value => typeof value === 'string' && value.trim() && value.length <= 100)) templates = saved;
    } catch (_) {}
    function render() {
        const selected = select.value;
        select.replaceChildren(new Option('Select Discipline…', ''));
        templates.forEach(name => select.append(new Option(name, name)));
        select.value = templates.includes(selected) ? selected : '';
        list.replaceChildren();
        templates.forEach(name => {
            const row = document.createElement('div');
            row.className = 'quick-template-item';
            const label = document.createElement('span');
            label.className = 'discipline-template-label';
            label.textContent = name;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'remove-template';
            remove.textContent = '×';
            remove.setAttribute('aria-label', 'Remove ' + name + ' template');
            remove.onclick = () => save(templates.filter(value => value !== name), 'Template removed. Active stations are unchanged.');
            row.append(label, remove);
            list.append(row);
        });
        if (!templates.length) list.textContent = 'No templates yet.';
    }
    function save(next, message) {
        try { localStorage.setItem(key, JSON.stringify(next)); }
        catch (_) { feedback.textContent = 'Templates could not be saved. Please check your browser storage settings.'; return false; }
        templates = next;
        render();
        feedback.textContent = message;
        return true;
    }
    toggle.onclick = () => {
        editor.hidden = !editor.hidden;
        toggle.textContent = editor.hidden ? 'Manage' : 'Done';
        toggle.setAttribute('aria-expanded', String(!editor.hidden));
    };
    form.addEventListener('submit', event => {
        event.preventDefault();
        const name = input.value.trim().replace(/\s+/g, ' ');
        input.setCustomValidity('');
        if (!name || name.length > 100) input.setCustomValidity('Enter a template name of 1–100 characters.');
        else if (templates.some(value => normalize(value) === normalize(name))) input.setCustomValidity('This template already exists.');
        if (!input.reportValidity()) return;
        if (save([...templates, name], 'Template saved. Select it from the dropdown and click Add to assign the station.')) {
            form.reset();
            window.FormSafety?.clean('quickTemplateForm');
        }
    });
    input.addEventListener('input', () => input.setCustomValidity(''));
    render();
})();
