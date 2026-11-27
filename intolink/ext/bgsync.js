// 뒤에서 받아 오기: 폰처럼 보이게 하는 규칙(탭 밖 요청만) + 화면 없는 문서(offscreen)에서 읽기
async function ensureOff() {
  const has = chrome.runtime.getContexts ? (await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })).length : 0;
  if (!has) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['DOM_PARSER'], justification: '인투링크 화면 읽기' });
}
chrome.runtime.onMessage.addListener((m, s, send) => {
  if (m.t === 'collect' && m.to !== 'off') {
    (async () => { try { await bgRule(true); await ensureOff(); const r = await chrome.runtime.sendMessage({ t: 'collect', to: 'off' }); send(r); } catch (e) { send({ at: Date.now(), err: [e.message], opd: [], pets: [], paid: [], dumps: {} }); } })();
    return true;
  }
  if (m.t === 'sync') chrome.tabs.create({ url: chrome.runtime.getURL('sync.html') });
});
