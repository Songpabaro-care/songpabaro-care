document.getElementById('sync').onclick = function () { chrome.runtime.sendMessage({ t: 'sync' }); window.close(); };
