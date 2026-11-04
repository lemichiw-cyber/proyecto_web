// global-delegator.js - Entry point for global click handler
// This runs in global scope, not module scope

function _global$(id) { return document.getElementById(id); }
function _globalLockBody() { document.body.style.overflow = 'hidden'; }

window.clickLogin = function clickLogin() {
  var modalLogin = _global$('modal-login');
  if (modalLogin) { modalLogin.classList.add('open'); _globalLockBody(); }
};

document.addEventListener('click', function (e) {
  var el = e.target && e.target.closest ? e.target.closest('[data-onclick]') : null;
  if (!el) return;
  var spec = el.getAttribute('data-onclick');
  if (!spec) return;
  var parts = spec.split('+');
  var fnName = parts[0];
  var args = parts.slice(1).map(function (a) {
    if (a === 'null') return null;
    if (a === 'true') return true;
    if (a === 'false') return false;
    return a;
  });
  var fn = window[fnName];
  if (typeof fn === 'function') {
    e.preventDefault();
    e.stopPropagation();
    fn.apply(window, args);
  }
}, true);