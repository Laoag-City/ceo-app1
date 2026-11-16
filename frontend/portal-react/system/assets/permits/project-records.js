/**
 * MAINTAINER GUIDE
 * Workspace Remarks and Logs panel renderer.
 * Creates DOM nodes for user content, loads records for the selected project, and submits remarks through the project-records API. Keep user text out of executable HTML.
 */
(() => {
    const node = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text !== undefined) element.textContent = text;
        if (className) element.className = className;
        return element;
    };
    function mount(host, kind, id, mode = 'comment') {
        host.replaceChildren();
        host.classList.add('project-records');
        let user;
        try { user = JSON.parse(sessionStorage.getItem('oboUser') || 'null'); } catch (_) {}
        const headers = { 'Content-Type': 'application/json', 'x-user-id': String(user?.id || ''), 'x-user-role': user?.role || '' };
        const url = `/api/project-records/${kind}/${id}`;
        const draftKey = `projectComment:${user?.id}:${kind}:${id}`;
        const readDraft = () => { try { return JSON.parse(sessionStorage.getItem(draftKey) || '{}'); } catch (_) { return {}; } };
        const remember = value => { try { sessionStorage.setItem(draftKey, JSON.stringify(value)); } catch (_) {} };
        const heading = node('div', undefined, 'records-heading');
        const title = node('div');
        title.append(node('h2', mode === 'activity' ? 'Logs' : 'Remarks'));
        const controls = node('div', undefined, 'records-controls');
        const commentButton = node('button', undefined, 'records-button');
        commentButton.type = 'button';
        const icon = node('span', undefined, 'records-comment-icon');
        icon.setAttribute('aria-hidden', 'true');
        const commentButtonLabel = node('span', 'Add Remarks');
        commentButton.append(icon, commentButtonLabel);
        const refresh = node('button', 'Refresh', 'records-button'); refresh.type = 'button';
        if(mode !== 'activity') controls.append(commentButton);
        controls.append(refresh); heading.append(title, controls);
        const form = node('form', undefined, 'records-comment-form');
        form.id = `projectCommentForm-${kind}-${id}`;
        form.hidden = true;
        commentButton.setAttribute('aria-controls', form.id);
        commentButton.setAttribute('aria-expanded', 'false');
        const label = node('label', 'Remark / reminder');
        const close = node('button', 'Close', 'records-button');
        close.type = 'button';
        close.setAttribute('aria-label', 'Close remark form');
        const formHeading = node('div', undefined, 'records-form-heading');
        formHeading.append(label, close);
        const textarea = node('textarea');
        textarea.id = `${form.id}-text`; label.htmlFor = textarea.id;
        textarea.required = true; textarea.maxLength = 2000; textarea.rows = 3;
        textarea.placeholder = 'Leave information other operators should know…';
        textarea.value = readDraft().text || '';
        const help = node('p', 'Visible to operators and administrators. Comments do not change approval status.');
        const submit = node('button', 'Post comment', 'records-button records-submit'); submit.type = 'submit';
        form.append(formHeading, textarea, help, submit);
        const feedback = node('p', '', 'records-feedback'); feedback.setAttribute('role', 'status');
        const feed = node('div', undefined, 'records-feed');
        const more = node('button', 'Load older records', 'records-button'); more.type = 'button'; more.hidden = true;
        host.append(heading);
        if(mode !== 'activity') host.append(form);
        host.append(feedback, feed, more);
        let cursor = null, loading = false, saving = false;
        const deletedRemarks = new Set();
        const emptyLabel = () => node('p', mode === 'activity' ? 'No activity recorded yet.' : 'No comments yet.', 'records-empty');
        async function deleteRemark(id, button) {
            if (button.disabled || !window.confirm('Delete this remark?')) return;
            button.disabled = true;
            feedback.textContent = '';
            try {
                await RequestFeedback.fetch(url + '/comments/' + id, { method: 'DELETE', headers });
                deletedRemarks.add(id);
                feed.querySelector(`[data-remark-id="${id}"]`)?.remove();
                if (!feed.children.length) feed.append(emptyLabel());
                feedback.textContent = 'Remark deleted.';
                if (host.isConnected) refresh.focus();
            } catch (error) {
                feedback.textContent = error.message || 'Could not delete the remark. Please try again.';
            } finally {
                button.disabled = false;
            }
        }
        async function load(append = false) {
            if (loading) return;
            loading = true; refresh.disabled = true; more.disabled = true;
            try {
                const response = await RequestFeedback.fetch(url + `?category=${mode}` + (append && cursor ? `&before=${cursor}` : ''), { headers });
                const data = await response.json();
                if (!host.isConnected) return;
                if (!append) feed.replaceChildren();
                else feed.querySelector('.records-empty')?.remove();
                for (const record of data.records) {
                    const remarkId = Number(record.id);
                    if (deletedRemarks.has(remarkId)) continue;
                    const article = node('article', undefined, 'records-entry');
                    const meta = node('div', undefined, 'records-meta');
                    meta.append(node('strong', record.actor_name), node('time', record.created_at));
                    article.append(meta);
                    if(record.outcome === 'unconfirmed') article.append(node('span','Outcome unconfirmed','records-tag'));
                    article.append(node('p', record.message));
                    if (record.details) {
                        let detail;
                        try { detail=JSON.parse(record.details); } catch (_) {}
                        if(detail?.version===1 && Array.isArray(detail.changes)) {
                            const container=detail.changes.length>2 ? node('details',undefined,'records-changes') : node('div');
                            if(detail.changes.length>2)container.append(node('summary',`${detail.changes.length} changes`));
                            for(const change of detail.changes)container.append(node('p',`${change.field}: ${change.before || 'Empty'} → ${change.after || 'Empty'}`,'records-detail'));
                            article.append(container);
                        } else article.append(node('p', record.details, 'records-detail'));
                    }
                    if (mode === 'comment' && record.category === 'comment' && record.canDelete === true &&
                        Number.isSafeInteger(remarkId) && remarkId > 0) {
                        article.dataset.remarkId = remarkId;
                        const remove = node('button', 'Delete', 'records-button records-delete');
                        remove.type = 'button';
                        remove.setAttribute('aria-label', 'Delete your remark');
                        remove.onclick = () => deleteRemark(remarkId, remove);
                        article.append(remove);
                    }
                    feed.append(article);
                }
                if (!feed.children.length) feed.append(emptyLabel());
                cursor = data.next; more.hidden = !cursor;
                return true;
            } catch (error) {
                feedback.textContent = 'Could not load project records. Use Refresh to try again.';
                return false;
            } finally { loading = false; refresh.disabled = false; more.disabled = false; }
        }
        function setFormOpen(open) {
            form.hidden = !open;
            commentButtonLabel.textContent = open ? 'Hide form' : 'Add Remarks';
            commentButton.setAttribute('aria-expanded', String(open));
            (open ? textarea : commentButton).focus();
        }
        commentButton.onclick = () => setFormOpen(form.hidden);
        close.onclick = () => setFormOpen(false);
        textarea.addEventListener('input', () => {
            textarea.setCustomValidity('');
            const old = readDraft(); remember({ ...old, text: textarea.value });
        });
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (saving) return;
            const message = textarea.value.trim();
            textarea.setCustomValidity(message ? '' : 'Enter a comment before posting.');
            if (!form.reportValidity()) return;
            let draft = readDraft();
            if (!draft.requestId || draft.submitted !== message) {
                const bytes = crypto.getRandomValues(new Uint8Array(16));
                bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
                const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
                draft = { text: textarea.value, submitted: message, requestId: `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}` };
                remember(draft);
            }
            saving = true; submit.disabled = true; textarea.readOnly = true;
            try {
                const response = await RequestFeedback.fetch(url + '/comments', { method: 'POST', headers, body: JSON.stringify({ message, requestId: draft.requestId }) });
                const result = await response.json();
                remember({}); textarea.value = ''; window.FormSafety?.clean(form.id);
                const notice = result.deleted ? 'This remark was already deleted.' : 'Comment posted.';
                feedback.textContent = notice;
                if (!await load()) feedback.textContent = notice + ' Refresh to reload the records.';
            } catch (error) {
                feedback.textContent = error.message || 'Comment could not be confirmed. Your draft is kept; refresh the records before retrying.';
            } finally { saving = false; submit.disabled = false; textarea.readOnly = false; }
        });
        refresh.onclick = () => { feedback.textContent = ''; load(); };
        more.onclick = () => load(true);
        load();
    }
    window.ProjectRecords = { mount };
    document.addEventListener('DOMContentLoaded', () => {
        const host = document.querySelector('[data-project-records]');
        if (host) {
            const disclosure=node('details',undefined,'records-disclosure');
            const summary=node('summary','Logs');
            const content=node('div');
            disclosure.append(summary,content);host.append(disclosure);
            let loaded=false;
            disclosure.addEventListener('toggle',()=>{
                if(disclosure.open && !loaded){loaded=true;mount(content,host.dataset.projectRecords,Number(new URLSearchParams(location.search).get('id')),'activity');}
            });
        }
    });
})();
