// 💳 수납완료 화면이 뒤에서 데이터를 어디서 받아 오는지 한 번 확인하기
// 수납완료 화면을 잠깐 열어 화면이 보내는 요청(주소·방식·보낸 칸 이름)과 받은 데이터의 모양만 기록하고 탭을 닫음.
// 값은 가림: 한글 → 가, 숫자 → 0, 영문 값 → a (칸 이름은 그대로)
const npMask = s => String(s).replace(/[가-힣]/g, '가').replace(/[0-9]/g, '0');
function npQuery(u) {
  try { const x = new URL(u); return x.origin.replace(/^https:\/\//, '') + x.pathname + (x.search ? '?' + [...x.searchParams].map(([k, v]) => k + '=' + npMask(v).slice(0, 12)).join('&') : ''); } catch (e) { return npMask(u).slice(0, 160); }
}
function npBody(b) {
  if (!b) return '';
  if (/Content-Disposition/i.test(b)) return '(폼) 칸 이름: ' + [...b.matchAll(/name="([^"]+)"/g)].map(m => m[1]).join(', ');
  try { const j = JSON.parse(b); return '(JSON) ' + Object.keys(j).map(k => k + '=' + npMask(typeof j[k] === 'object' ? JSON.stringify(j[k]) : j[k]).slice(0, 12)).join('&'); } catch (e) {}
  try { return [...new URLSearchParams(b)].map(([k, v]) => k + '=' + npMask(v).slice(0, 12)).join('&'); } catch (e) { return npMask(b).slice(0, 160); }
}
async function netProbe(path) {
  const out = [`== 데이터 주소 찾기 · ${path} · ${new Date().toLocaleTimeString('ko-KR')} ==`];
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false });
  const reqs = {}, done = [];
  let tgt = null;
  const on = async (src, m, p) => {
    if (!tgt || src.tabId !== tab.id) return;
    if (m === 'Network.requestWillBeSent' && /intolink/.test(p.request.url) && !/sso\.intolink|\/api\/frame|login|token|google/i.test(p.request.url) && ['XHR', 'Fetch'].includes(p.type))
      reqs[p.requestId] = { url: p.request.url, method: p.request.method, post: p.request.postData || '', ty: p.type };
    if (m === 'Network.responseReceived' && reqs[p.requestId]) { reqs[p.requestId].st = p.response.status; reqs[p.requestId].mt = p.response.mimeType; }
    if (m === 'Network.loadingFinished' && reqs[p.requestId]) {
      try { const b = await chrome.debugger.sendCommand(tgt, 'Network.getResponseBody', { requestId: p.requestId }); const t = b.base64Encoded ? atob(b.body) : b.body; reqs[p.requestId].len = t.length;
        try { reqs[p.requestId].shape = shape(JSON.parse(t), 0).slice(0, 900); } catch (e) { reqs[p.requestId].shape = '(JSON 아님) ' + npMask(t.replace(/\s+/g, ' ')).slice(0, 200); } } catch (e) { reqs[p.requestId].shape = '(내용 못 읽음)'; }
      done.push(p.requestId);
    }
  };
  chrome.debugger.onEvent.addListener(on);
  try {
    tgt = await mobileTab(tab.id);
    await dbg(tgt, 'Page.navigate', { url: 'https://intolink.co.kr' + path });
    await new Promise(r => setTimeout(r, 8000));
    // 화면 뒤 Vue 앱의 함수 이름·데이터 칸 이름, 그리고 '조회/검색' 버튼이 있으면 한 번 눌러 봄 (값은 안 읽음)
    try {
      const ev = await dbg(tgt, 'Runtime.evaluate', { returnByValue: true, expression: `(() => { const o = [];
        document.querySelectorAll('[id]').forEach(el => { const vm = el.__vue__; if (vm && vm.$options && !o.some(x => x.vm === vm)) o.push({ vm, id: el.id }); });
        const info = o.slice(0, 4).map(x => '#' + x.id + ' 함수: ' + Object.keys(x.vm.$options.methods || {}).join(', ') + ' · 데이터 칸: ' + Object.keys(x.vm.$data || {}).join(', '));
        const b = [...document.querySelectorAll('button, a, input[type=button], input[type=submit]')].find(e => /조회|검색|오늘|search/i.test((e.textContent || e.value || '').trim()) && e.offsetParent);
        if (b) b.click();
        return info.join('\n') + '\n누른 버튼: ' + (b ? (b.textContent || b.value || '').trim().replace(/[가-힣]+/g, m => /조회|검색|오늘/.test(m) ? m : '가').slice(0, 20) : '없음'); })()` });
      out.push((ev.result && ev.result.value) || '(Vue 정보 없음)');
    } catch (e) { out.push('Vue 정보 읽기 실패: ' + e.message); }
    await new Promise(r => setTimeout(r, 6000));
    const ids = Object.keys(reqs);
    out.push(`화면이 보낸 데이터 요청 ${ids.length}개`);
    ids.forEach((id, i) => { const q = reqs[id];
      out.push(`\n${i + 1}) ${q.method} ${npQuery(q.url)}  [${q.ty} · ${q.st || '?'} · ${q.mt || ''}${q.len != null ? ' · ' + q.len + '자' : ''}]`);
      if (q.post) out.push('   보낸 칸: ' + npBody(q.post));
      if (q.shape) out.push('   받은 모양: ' + q.shape); });
    if (!ids.length) out.push('요청이 안 잡혔어요 (화면이 데이터를 처음부터 담고 있거나 로그인이 풀렸을 수 있어요)');
  } catch (e) { out.push('실패: ' + e.message); }
  chrome.debugger.onEvent.removeListener(on);
  try { await chrome.debugger.detach({ tabId: tab.id }); } catch (e) {}
  try { await chrome.tabs.remove(tab.id); } catch (e) {}
  return out.join('\n');
}
chrome.runtime.onMessage.addListener((m, s, send) => {
  if (m.t === 'netprobe') { netProbe(m.path || '/plus/receiptCompleted').then(send, e => send('실패: ' + e.message)); return true; }
});
