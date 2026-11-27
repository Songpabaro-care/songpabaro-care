// 🧭 차트 화면 진단 (/plus/main): 목록 → '차트' 누름 → 오른쪽 아래 검은 단추 누름. 단계별로 받은 데이터 모양과 칸 이름만 기록 (값은 가림)
async function probe2() {
  const out = ['== 🧭 차트 화면 진단 (plus/main) ' + new Date().toLocaleString('ko-KR') + ' =='];
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  let tgt = null;
  try { tgt = await mobileTab(tab.id); } catch (e) { out.push('폰 모드 실패: ' + e.message); }
  const res = []; let STEP = '1 목록';
  const on = (src, m, p) => {
    if (!tgt || src.tabId !== tab.id) return;
    if (m === 'Network.responseReceived' && /intolink/.test(p.response.url) && ['XHR', 'Fetch', 'Document'].includes(p.type)) res.push({ id: p.requestId, url: p.response.url, ty: p.type, st: p.response.status, step: STEP });
    if (m === 'Network.requestWillBeSent' && /intolink/.test(p.request.url) && ['XHR', 'Fetch'].includes(p.type)) res.push({ req: true, url: p.request.url, body: p.request.postData || '', step: STEP });
  };
  chrome.debugger.onEvent.addListener(on);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const run = async (func, world) => { const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: world || 'ISOLATED', func }); return r.result; };
  try {
    if (tgt) await dbg(tgt, 'Page.navigate', { url: 'https://intolink.co.kr/plus/main' });
    await wait(6000);
    // 목록·'차트' 링크 상태
    let st = await run(() => {
      const links = [...document.querySelectorAll('a,button,span,td')].filter(e => e.textContent.trim() === '차트' && !e.children.length);
      const q = [...document.querySelectorAll('button,a,input[type=button],input[type=submit]')].find(e => /^\s*조회\s*$/.test(e.textContent || e.value || ''));
      return { path: location.pathname, nChart: links.length, hasQuery: !!q };
    });
    out.push(`1) ${st.path} · '차트' 링크 ${st.nChart}개 · 조회 버튼 ${st.hasQuery ? '있음' : '없음'}`);
    if (!st.nChart && st.hasQuery) {
      STEP = '1b 조회 누름';
      await run(() => { const q = [...document.querySelectorAll('button,a,input[type=button],input[type=submit]')].find(e => /^\s*조회\s*$/.test(e.textContent || e.value || '')); if (q) q.click(); }, 'MAIN');
      await wait(5000);
      st = await run(() => ({ nChart: [...document.querySelectorAll('a,button,span,td')].filter(e => e.textContent.trim() === '차트' && !e.children.length).length }));
      out.push(`   조회 누른 뒤 '차트' 링크 ${st.nChart}개`);
    }
    // 첫 '차트' 링크의 속성과 클릭 동작
    const info = await run(() => {
      const M = t => String(t).replace(/[가-힣]+/g, '가').replace(/\d{3,}/g, '000');
      const a = [...document.querySelectorAll('a,button,span,td')].find(e => e.textContent.trim() === '차트' && !e.children.length);
      if (!a) return null;
      const chain = []; let e = a;
      for (let i = 0; i < 4 && e; i++, e = e.parentElement) chain.push(e.tagName.toLowerCase() + ' ' + [...e.attributes].filter(x => x.name !== 'style').map(x => x.name + '=' + M(x.value).slice(0, 120)).join(' '));
      let jq = [];
      try { const J = window.jQuery; if (J && J._data) for (const el of [a, a.parentElement, a.closest('tr'), a.closest('table'), document, document.body]) { if (!el) continue; const ev = J._data(el, 'events') || {}; for (const h of (ev.click || [])) jq.push((h.selector || '') + ' → ' + M(String(h.handler).replace(/\s+/g, ' ').slice(0, 500))); } } catch (x) {}
      const vue = !!(a.__vue__ || a.__vnode || (a.closest('[data-v-app]')));
      return { chain, jq: [...new Set(jq)].slice(0, 8), vue };
    }, 'MAIN');
    if (info) {
      out.push("2) 첫 '차트' 링크:");
      info.chain.forEach(c => out.push('   · ' + c));
      out.push('   Vue: ' + (info.vue ? '예' : '아니오'));
      info.jq.forEach(j => out.push('   [클릭 동작] ' + j));
      STEP = "2 '차트' 누름";
      await run(() => { const a = [...document.querySelectorAll('a,button,span,td')].find(e => e.textContent.trim() === '차트' && !e.children.length); if (a) a.click(); }, 'MAIN');
      await wait(5000);
      st = await run(() => ({ path: location.pathname + location.search.replace(/=[^&]*/g, '=…'), chart: document.body.innerText.indexOf('차트정보') >= 0 }));
      out.push(`   → 주소 ${st.path} · 차트정보 ${st.chart ? '보임' : '안 보임'}`);
      // 오른쪽 아래 검은 단추
      STEP = '3 검은 단추';
      const pill = await run(() => {
        const e = [...document.querySelectorAll('body *')].filter(e => { const s = getComputedStyle(e); return s.position === 'fixed' && e.offsetWidth > 0 && /•|·/.test(e.textContent) && e.textContent.trim().length < 40; }).pop();
        if (!e) return null; const tag = e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]; (e.querySelector('a,button') || e).click(); return tag;
      }, 'MAIN');
      out.push('3) 검은 단추: ' + (pill || '못 찾음'));
      await wait(3500);
      const det = await run(() => {
        const want = ['고객번호', '동물번호', '고객명', '동물이름', '종', '품종', '성별', '체중', '생년월일'];
        const rows = [];
        for (const e of document.querySelectorAll('body *')) {
          if (e.childElementCount) continue;
          const t = e.textContent.replace(/[:\s]/g, '');
          if (want.includes(t)) { const nx = e.nextElementSibling || (e.parentElement && e.parentElement.nextElementSibling); rows.push(t + ' (' + e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ') → ' + (nx ? nx.tagName.toLowerCase() + '.' + String(nx.className).split(' ')[0] + ' ' + (nx.id ? '#' + nx.id : '') : '?')); }
        }
        return rows.slice(0, 12);
      });
      out.push('   상세 정보 칸: ' + (det.length ? '' : '(못 찾음)'));
      det.forEach(d => out.push('   · ' + d));
    } else out.push("2) '차트' 링크를 못 찾음");
  } catch (e) { out.push('실패: ' + e.message); }
  out.push('-- 단계별 요청·받은 데이터 (값은 가림) --');
  let n = 0;
  for (const q of res) {
    if (q.req) { out.push(`[${q.step}] 보냄 ${purl(q.url)}` + (q.body ? ' · 보낸 값: ' + pmask(q.body).slice(0, 200) : '')); continue; }
    let line = `[${q.step}] ${q.ty} ${q.st} ${purl(q.url)}`;
    if ((q.ty === 'XHR' || q.ty === 'Fetch') && n < 12 && tgt && !/frameProc|google/.test(q.url)) {
      n++;
      try { const b = await dbg(tgt, 'Network.getResponseBody', { requestId: q.id }); const txt = b.base64Encoded ? atob(b.body) : b.body;
        try { line += '\n      → ' + pshape(JSON.parse(txt), 0).slice(0, 1000); } catch (e) { line += '\n      → (JSON 아님) 길이 ' + txt.length; } } catch (e) { line += ' (내용 못 읽음)'; }
    }
    out.push(line);
  }
  chrome.debugger.onEvent.removeListener(on);
  try { if (tgt) await chrome.debugger.detach(tgt); } catch (e) {}
  await chrome.storage.session.set({ diag: out.join('\n') });
  await chrome.tabs.create({ url: chrome.runtime.getURL('result.html') });
  try { await chrome.tabs.remove(tab.id); } catch (e) {}
}
chrome.runtime.onMessage.addListener(m => { if (m.t === 'probe2') probe2(); });
