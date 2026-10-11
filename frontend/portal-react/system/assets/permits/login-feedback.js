window.renderLoginFeedback = function(box, message, isError) {
    box.replaceChildren();
    box.className = 'login-feedback' + (isError ? ' is-error' : '');
    box.setAttribute('role', isError ? 'alert' : 'status');
    const icon = document.createElementNS('http://www.w3.org/2000/svg','svg');
    icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
    icon.innerHTML = '<circle cx="12" cy="12" r="9"/><path d="'+(isError?'M12 7v6M12 16h.01':'m8 12 3 3 5-6')+'"/>';
    const text = document.createElement('span');text.textContent=message;
    const close = document.createElement('button');close.type='button';close.setAttribute('aria-label','Dismiss message');
    close.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    close.addEventListener('click',()=>{box.style.display='none';});
    box.append(icon,text,close);box.style.display='flex';
};
