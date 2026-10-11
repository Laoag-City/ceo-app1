/* Personal dropdown preferences; assigning stations uses the existing Add form. */
(() => {
    const select = document.getElementById('disciplineSelect');
    const toggle = document.getElementById('manageOccTemplates');
    const editor = document.getElementById('occTemplateEditor');
    const list = document.getElementById('occTemplateList');
    const form = document.getElementById('occTemplateForm');
    const input = document.getElementById('occTemplateName');
    const feedback = document.getElementById('occTemplateFeedback');
    const restore = document.getElementById('restoreOccTemplates');
    let defaults = [...select.options].filter(option => option.value).map(option => option.textContent.trim());
    let templates = [...defaults];
    let assignedStations = [];
    let user;
    try { user = JSON.parse(sessionStorage.getItem('oboUser') || 'null'); } catch (_) {}
    const key = 'occupancyQuickTemplates:v1:' + (user?.id || user?.username || 'local');
    const normalize = value => String(value || '').normalize('NFKC').trim().toUpperCase().replace(/&/g, ' AND ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const unique = names => names.filter((name, index) => names.findIndex(value => normalize(value) === normalize(name)) === index);
    try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (Array.isArray(saved) && saved.every(value => typeof value === 'string' && value.trim() && value.length <= 100)) templates = saved;
    } catch (_) {}
    function render() {
        const selected = select.value;
        select.replaceChildren(new Option('Select Discipline…', ''));
        const options = unique([...templates, ...assignedStations]);
        options.forEach(name => select.append(new Option(name, name)));
        select.value = options.find(name => normalize(name) === normalize(selected)) || '';
        list.replaceChildren();
        templates.forEach(name => {
            const row = document.createElement('div');
            row.className = 'quick-template-item';
            const label = document.createElement('span');
            label.className = 'occ-template-label';
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
    if (restore) restore.onclick = () => save(unique([...defaults, ...templates]), 'Standard templates restored. Active stations are unchanged.');
    form.addEventListener('submit', event => {
        event.preventDefault();
        const name = input.value.trim().replace(/\s+/g, ' ');
        input.setCustomValidity('');
        if (!name || name.length > 100) input.setCustomValidity('Enter a template name of 1–100 characters.');
        else if (templates.some(value => normalize(value) === normalize(name))) input.setCustomValidity('This template already exists.');
        if (!input.reportValidity()) return;
        if (save([...templates, name], 'Template saved. Select it from the dropdown and click Add to assign the station.')) {
            form.reset();
            window.FormSafety?.clean('occTemplateForm');
        }
    });
    input.addEventListener('input', () => input.setCustomValidity(''));
    window.OccupancyTemplates = {
        update(project) {
            if (Array.isArray(project.standard_stations) && project.standard_stations.length && project.standard_stations.every(name => typeof name === 'string' && name.trim() && name.length <= 100)) {
                defaults = unique(project.standard_stations.map(name => name.trim()));
            }
            assignedStations = Array.isArray(project.assigned_stations) ? project.assigned_stations : typeof project.assigned_station === 'string' && project.assigned_station.trim() ? [project.assigned_station.trim()] : [];
            render();
        }
    };
    render();
})();
