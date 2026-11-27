const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';
const KEEP = ['진료대기', '대기', '입원', '호텔', '접수', '수납', '수납완료', '완료', '진료중', '진료', '외래', '퇴원', '미수', '보호자', '고객', '고객명', '동물', '동물명', '환자', '이름', '번호', '차트', '상태', '시간', '오늘', '전체', '검색', '종', '품종', '체중', '나이', '성별', '담당', '수의사', '방', '룸', '입원실', '호텔실', '메모', '예약', '대기자', '목록', 'Canine', 'Feline', '중성화', '수컷', '암컷'];
// 글자 모양만 남기고 가리기: 한글 → 가, 숫자 → 0, 영문 → a (아는 화면 낱말은 그대로)
function mask(s) {
  return String(s).replace(/\s+/g, ' ').trim().split(' ').map(w => {
    const core = w.replace(/[()\[\]:,.\/·-]/g, '');
    if (KEEP.includes(core)) return w;
    return w.replace(/[가-힣]/g, '가').replace(/[0-9]/g, '0').replace(/[A-Za-z]/g, 'a');
  }).join(' ').slice(0, 80);
}
function shape(v, d) {
  if (d > 5) return '…';
  if (Array.isArray(v)) return v.length ? `[${v.length}개] ` + shape(v[0], d + 1) : '[]';
  if (v && typeof v === 'object') return '{' + Object.keys(v).slice(0, 40).map(k => k + ':' + shape(v[k], d + 1)).join(', ') + '}';
  if (typeof v === 'string') return '"' + mask(v).slice(0, 20) + '"';
  return typeof v;
}
async function uaRule(tabIds) {
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1], addRules: [{
    id: 1, priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [
      { header: 'user-agent', operation: 'set', value: UA },
      { header: 'sec-ch-ua-mobile', operation: 'set', value: '?1' },
      { header: 'sec-ch-ua-platform', operation: 'set', value: '"Android"' }] },
    condition: { requestDomains: ['intolink.co.kr'], tabIds } }] });
}
chrome.runtime.onMessage.addListener(m => { if (m.t === 'diag') diag(); });
async function dbg(tgt, m, p) { return chrome.debugger.sendCommand(tgt, m, p || {}); }
// 개발자 도구 '폰 화면 모드'와 같은 방식
async function mobileTab(tabId) {
  const tgt = { tabId };
  await chrome.debugger.attach(tgt, '1.3');
  await dbg(tgt, 'Network.enable');
  await dbg(tgt, 'Page.enable');
  await dbg(tgt, 'Emulation.setUserAgentOverride', { userAgent: UA, platform: 'Linux armv8l', acceptLanguage: 'ko-KR',
    userAgentMetadata: { brands: [{ brand: 'Chromium', version: '121' }, { brand: 'Samsung Internet', version: '25' }], fullVersion: '121.0.0.0',
      platform: 'Android', platformVersion: '14.0.0', architecture: '', model: 'SM-A556N', mobile: true } });
  await dbg(tgt, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await dbg(tgt, 'Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2.6, mobile: true });
  return tgt;
}
async function diag() {
  const out = ['== 인투링크 진단 0.2 ' + new Date().toLocaleString('ko-KR') + ' =='];
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  let tgt;
  try { tgt = await mobileTab(tab.id); } catch (e) { out.push('폰 모드 켜기 실패: ' + e.message); }
  const res = [];
  const on = (src, m, p) => {
    if (!tgt || src.tabId !== tab.id) return;
    if (m === 'Network.responseReceived' && /intolink/.test(p.response.url) && !['Image', 'Font', 'Stylesheet', 'Media'].includes(p.type))
      res.push({ id: p.requestId, url: p.response.url, ty: p.type, st: p.response.status, mt: p.response.mimeType });
  };
  chrome.debugger.onEvent.addListener(on);
  try { if (tgt) await dbg(tgt, 'Page.navigate', { url: 'https://intolink.co.kr/plus/waitList' }); else await chrome.tabs.update(tab.id, { url: 'https://intolink.co.kr/plus/waitList' }); } catch (e) { out.push('열기 실패: ' + e.message); }
  await new Promise(r => setTimeout(r, 10000));
  let page = null;
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
      const lines = []; const seen = new Set();
      const walk = (el, depth) => {
        if (lines.length > 160 || depth > 25) return;
        for (const c of el.children) {
          if (['SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT'].includes(c.tagName)) continue;
          const own = [...c.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim();
          if (own) { const tag = c.tagName.toLowerCase() + (c.className && typeof c.className === 'string' ? '.' + c.className.trim().split(/\s+/).slice(0, 2).join('.') : ''); const k = tag + '|' + own; if (!seen.has(k)) { seen.add(k); lines.push([depth, tag, own]); } }
          walk(c, depth + 1);
        }
      };
      walk(document.body, 0);
      return { url: location.pathname, title: document.title, len: document.body.innerText.length, lines, frames: document.querySelectorAll('iframe').length };
    } });
    page = r.result;
  } catch (e) { out.push('화면 읽기 실패: ' + e.message); }
  if (page) {
    out.push('화면: ' + page.url + ' · 제목 ' + mask(page.title) + ' · 글자 ' + page.len + ' · iframe ' + page.frames);
    out.push('-- 화면 구조 (글자는 가림) --');
    for (const [d, tag, t] of page.lines.slice(0, 110)) out.push(' '.repeat(Math.min(d, 12)) + tag.slice(0, 40) + ' : ' + mask(t));
  }
  out.push('-- 화면이 받은 데이터 --');
  let n = 0;
  for (const q of res) {
    const u = new URL(q.url); const p = u.host + u.pathname + (u.search ? ' ?' + [...u.searchParams.keys()].join('&') : '');
    let line = q.ty + ' ' + q.st + ' ' + p;
    if ((q.ty === 'XHR' || q.ty === 'Fetch') && n < 8 && tgt) {
      n++;
      try { const b = await dbg(tgt, 'Network.getResponseBody', { requestId: q.id }); const txt = b.base64Encoded ? atob(b.body) : b.body;
        try { line += '\n    → ' + shape(JSON.parse(txt), 0).slice(0, 1200); } catch (e) { line += '\n    → (JSON 아님) 길이 ' + txt.length; } } catch (e) { line += ' (내용 못 읽음)'; }
    }
    out.push(line);
  }
  chrome.debugger.onEvent.removeListener(on);
  try { if (tgt) await chrome.debugger.detach(tgt); } catch (e) {}
  await chrome.storage.session.set({ diag: out.join('\n') });
  await chrome.tabs.create({ url: chrome.runtime.getURL('result.html') });
  try { await chrome.tabs.remove(tab.id); } catch (e) {}
}
