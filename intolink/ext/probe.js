// 🧭 줄 눌러 보기: 진료대기 첫 줄 → 차트 화면 → 오른쪽 아래 '보호자 • 동물' 버튼 → 상세 정보. 주소·데이터 모양만 기록 (값은 가림)
function pmask(s) { return String(s).replace(/[가-힣]/g, '가').replace(/[0-9]/g, '0').replace(/[A-Za-z]/g, 'a'); }
function pshape(v, d) {
  if (d > 4) return '…';
  if (Array.isArray(v)) return v.length ? `[${v.length}개] ` + pshape(v[0], d + 1) : '[]';
  if (v && typeof v === 'object') return '{' + Object.keys(v).slice(0, 50).map(k => k + ':' + pshape(v[k], d + 1)).join(', ') + '}';
  if (typeof v === 'string') return '"' + pmask(v).slice(0, 14) + '"';
  return typeof v;
}
function purl(u) { try { const x = new URL(u); return x.host + x.pathname + (x.search ? ' ?' + [...x.searchParams.entries()].map(([k, v]) => k + '=' + pmask(v).slice(0, 12)).join('&') : ''); } catch (e) { return '?'; } }
async function probe() {
  const out = ['== 🧭 줄 눌러 보기 ' + new Date().toLocaleString('ko-KR') + ' =='];
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  let tgt = null;
  try { tgt = await mobileTab(tab.id); } catch (e) { out.push('폰 모드 실패: ' + e.message); }
  const res = [];
  const on = (src, m, p) => {
    if (!tgt || src.tabId !== tab.id) return;
    if (m === 'Network.responseReceived' && /intolink/.test(p.response.url) && ['XHR', 'Fetch', 'Document'].includes(p.type)) res.push({ id: p.requestId, url: p.response.url, ty: p.type, st: p.response.status, step: STEP });
  };
  let STEP = '1 진료대기';
  chrome.debugger.onEvent.addListener(on);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const look = async () => { const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
    const has = w => document.body.innerText.indexOf(w) >= 0;
    const fixed = [...document.querySelectorAll('body *')].filter(e => { const s = getComputedStyle(e); return s.position === 'fixed' && e.offsetWidth > 0 && /•|·/.test(e.textContent) && e.textContent.trim().length < 40; }).map(e => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]);
    const labels = [...document.querySelectorAll('th, dt, label, .tit, .title, .label, span, div')].map(e => e.childElementCount ? '' : e.textContent.trim()).filter(t => /^(고객번호|동물번호|차트번호|고객명|동물이름|동물명)\s*:?$/.test(t));
    return { path: location.pathname, search: location.search, has: { 고객번호: has('고객번호'), 동물번호: has('동물번호'), 차트정보: has('차트정보') }, fixed: [...new Set(fixed)].slice(0, 4), labels: [...new Set(labels)] };
  } }); return r.result; };
  try {
    if (tgt) await dbg(tgt, 'Page.navigate', { url: 'https://intolink.co.kr/plus/waitList' });
    await wait(6000);
    let s = await look(); out.push('1) 진료대기: ' + s.path);
    // 줄을 누르면 어디로 가는지: 화면 안 프로그램에서 해당 부분 (한글·숫자는 가림)
    const [cd] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: () => {
      const M = t => t.replace(/[가-힣]+/g, '가').replace(/\d{3,}/g, '000');
      const hits = [];
      // 화면 안 프로그램에서 낱말 앞뒤 문맥 (긴 줄도 잘라서)
      const KW = /chartModal|chart-modal|waitListTable|result_table|\$\.ajax|\$\.post|\$\.get\(|axios|fetch\(|url\s*:|pet_?idx|cust_?idx|animal|chart_?no|ani_?idx|getChart|showChart/gi;
      for (const sc of document.querySelectorAll('script:not([src])')) {
        const t = sc.textContent; let m;
        while ((m = KW.exec(t)) && hits.length < 40) hits.push('[' + m[0] + '] ' + M(t.slice(Math.max(0, m.index - 150), m.index + 260).replace(/\s+/g, ' ')));
      }
      const tr = [...document.querySelectorAll('#waitListTable tr')].find(r => r.querySelector('td') && r.textContent.trim());
      // jQuery에 등록된 클릭 동작 (표·줄·문서)
      try {
        const jq = window.jQuery || window.$;
        if (jq && jq._data) {
          const targets = [['document', document], ['body', document.body], ['table', document.querySelector('#waitListTable')], ['tr', tr], ['td', tr && tr.querySelector('td')]];
          for (const [nm, el] of targets) {
            if (!el) continue;
            const ev = jq._data(el, 'events') || {};
            for (const type of ['click', 'touchstart', 'touchend', 'tap']) for (const h of (ev[type] || [])) hits.push(`[jQuery ${type} @${nm}${h.selector ? ' ' + h.selector : ''}] ` + M(String(h.handler).replace(/\s+/g, ' ').slice(0, 500)));
          }
        } else hits.push('(jQuery 없음)');
      } catch (e) { hits.push('(jQuery 읽기 실패 ' + e.message + ')'); }
      const attrs = tr ? [...tr.attributes, ...[...tr.querySelectorAll('*')].flatMap(e => [...e.attributes])].filter(a => a.name !== 'class' && a.name !== 'style').map(a => a.name + '=' + M(a.value).slice(0, 80)) : [];
      return { hits: [...new Set(hits)].slice(0, 45), attrs: attrs.slice(0, 10) };
    } });
    out.push('   줄에 붙은 속성: ' + (cd.result.attrs.join(' ') || '(없음)'));
    out.push('   화면 안 프로그램에서 찾은 부분:');
    cd.result.hits.forEach(h => out.push('     ' + h.slice(0, 520)));
    // 첫 환축 줄 누르기 (칸 제목 줄은 건너뜀)
    STEP = '2 줄 누름';
    const [c] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: () => {
      const tr = [...document.querySelectorAll('#waitListTable tr')].find(r => r.querySelector('td') && r.textContent.trim()); if (!tr) return '환축 줄 없음';
      const td = tr.querySelector('td');
      for (const el of [td, tr]) { ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend'].forEach(t => { try { el.dispatchEvent(new Event(t, { bubbles: true })); } catch (e) {} }); }
      td.click(); return '눌렀음';
    } });
    out.push('2) 첫 환축 줄 ' + c.result);
    await wait(6000);
    const opened = await chrome.tabs.query({}).then(ts => ts.filter(x => x.openerTabId === tab.id));
    if (opened.length) out.push('   → 새 탭으로 열림 ' + opened.length + '개 (이 방식은 다음 버전에서 따라가게 고칠게요)');
    s = await look();
    out.push('   → 주소: ' + purl('https://intolink.co.kr' + s.path + s.search));
    out.push('   → 화면: 차트정보 ' + (s.has.차트정보 ? '있음' : '없음') + ' · 고객번호 글자 ' + (s.has.고객번호 ? '있음' : '없음') + ' · 동물번호 글자 ' + (s.has.동물번호 ? '있음' : '없음'));
    out.push('   → 오른쪽 아래 버튼 후보: ' + (s.fixed.join(', ') || '(못 찾음)'));
    if (s.path === '/plus/waitList' && !s.has.차트정보) throw new Error('줄을 눌러도 차트로 넘어가지 않음 (위 "화면 안 프로그램" 부분으로 방법을 찾을게요)');
    // 오른쪽 아래 '보호자 • 동물' 버튼 누르기
    STEP = '3 버튼 누름';
    const [c2] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: () => {
      const e = [...document.querySelectorAll('body *')].filter(e => { const s = getComputedStyle(e); return s.position === 'fixed' && e.offsetWidth > 0 && /•|·/.test(e.textContent) && e.textContent.trim().length < 40; }).pop();
      if (!e) return '버튼 없음'; (e.querySelector('a,button') || e).click(); return '눌렀음';
    } });
    out.push('3) 오른쪽 아래 버튼 ' + c2.result);
    await wait(4000);
    s = await look();
    out.push('   → 상세 정보: 고객번호 글자 ' + (s.has.고객번호 ? '있음' : '없음') + ' · 동물번호 글자 ' + (s.has.동물번호 ? '있음' : '없음') + ' · 칸 이름 ' + (s.labels.join(', ') || '(못 찾음)'));
    // 상세 정보에서 칸 모양 (값은 가림)
    const [c3] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
      const want = ['고객번호', '동물번호', '동물이름', '고객명', '종', '품종', '성별', '체중'];
      const rows = [];
      for (const e of document.querySelectorAll('body *')) {
        if (e.childElementCount) continue;
        const t = e.textContent.replace(/[:\s]/g, '');
        if (want.includes(t)) { const nx = e.nextElementSibling || (e.parentElement && e.parentElement.nextElementSibling); rows.push([t, e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0], nx ? nx.tagName.toLowerCase() + '.' + String(nx.className).split(' ')[0] + ' = ' + nx.textContent.trim().slice(0, 20) : '']); }
      }
      return rows.slice(0, 12);
    } });
    for (const [k, a, b] of c3.result) out.push(`   · ${k} (${a}) → ${b.replace(/=.*$/, m => pmask(m))}`);
  } catch (e) { out.push('실패: ' + e.message); }
  out.push('-- 받은 데이터 (단계별, 값은 가림) --');
  let n = 0;
  for (const q of res) {
    let line = `[${q.step}] ${q.ty} ${q.st} ${purl(q.url)}`;
    if ((q.ty === 'XHR' || q.ty === 'Fetch') && n < 10 && tgt) {
      n++;
      try { const b = await dbg(tgt, 'Network.getResponseBody', { requestId: q.id }); const txt = b.base64Encoded ? atob(b.body) : b.body;
        try { line += '\n      → ' + pshape(JSON.parse(txt), 0).slice(0, 900); } catch (e) { line += '\n      → (JSON 아님) 길이 ' + txt.length; } } catch (e) { line += ' (내용 못 읽음)'; }
    }
    out.push(line);
  }
  chrome.debugger.onEvent.removeListener(on);
  try { if (tgt) await chrome.debugger.detach(tgt); } catch (e) {}
  await chrome.storage.session.set({ diag: out.join('\n') });
  await chrome.tabs.create({ url: chrome.runtime.getURL('result.html') });
  try { await chrome.tabs.remove(tab.id); } catch (e) {}
}
chrome.runtime.onMessage.addListener(m => { if (m.t === 'probe') probe(); });
