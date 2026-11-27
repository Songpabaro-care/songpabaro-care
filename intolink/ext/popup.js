document.getElementById('go').onclick = function () { chrome.runtime.sendMessage({ t: 'diag' }); window.close(); };
