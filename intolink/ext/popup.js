document.getElementById('go').onclick = function () { chrome.runtime.sendMessage({ t: 'diag' }); window.close(); };
document.getElementById('find').onclick = function () { chrome.runtime.sendMessage({ t: 'find' }); window.close(); };
document.getElementById('probe').onclick = function () { chrome.runtime.sendMessage({ t: 'probe' }); window.close(); };
document.getElementById('probe2').onclick = function () { chrome.runtime.sendMessage({ t: 'probe2' }); window.close(); };
