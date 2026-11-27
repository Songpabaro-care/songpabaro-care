// 🔬 연동 준비 진단: ① /plus/main 검색 조건·쪽 넘기기·줄 번호 칸 ② 탭 없이 뒤에서 받아 오기 시험 ③ 진료대기 숨은 입원·호텔 부분 (값은 가림)
async function bgRule(on) {
  if (!on) { await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [2] }); return; }
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [2], addRules: [{ id: 2, priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [
      { header: 'user-agent', operation: 'set', value: UA },
      { header: 'sec-ch-ua-mobile', operation: 'set', value: '?1' },
      { header: 'sec-ch-ua-platform', operation: 'set', value: '"Android"' }] },
    condition: { requestDomains: ['intolink.co.kr'], tabIds: [-1] } }] });
}
async function probe3() {
  const out = ['== 🔬 연동 준비 진단 1.0 ' + new Date().toLocaleString('ko-KR') + ' =='];
  const M = t => String(t).replace(/[가-힣]/g, '가').replace(/[0-9]/g, '0').replace(/[A-Za-z]/g, 'a');
  // ② 탭 없이 뒤에서 받아 오기
  out.push('-- ② 탭 없이 받아 오기 --');
  try {
    await bgRule(true);
    for (const p of ['/plus/main', '/plus/waitList', '/plus/receiptCompleted']) {
      try {
        const r = await fetch('https://intolink.co.kr' + p, { credentials: 'include', redirect: 'follow' });
        const t = await r.text();
        out.push(`${p} → ${r.status} · ${new URL(r.url).host}${new URL(r.url).pathname} · 길이 ${t.length} · 표 chartSearchTable ${/chartSearchTable/.test(t) ? '있음' : '없음'} · waitListTable ${/waitListTable/.test(t) ? '있음' : '없음'} · status_data_row ${(t.match(/status_data_row/g) || []).length}개 · 서비스 불가 ${/이용할 수 없습니다/.test(t) ? '예' : '아니오'}`);
      } catch (e) { out.push(`${p} → 실패 ${e.message}`); }
    }
  } catch (e) { out.push('규칙 실패 ' + e.message); }
  await bgRule(false);
  // ①·③ 은 폰 모드 탭에서
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  let tgt = null;
  try { tgt = await mobileTab(tab.id); } catch (e) { out.push('폰 모드 실패: ' + e.message); }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const run = async (func) => { const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func }); return r.result; };
  try {
    if (tgt) await dbg(tgt, 'Page.navigate', { url: 'https://intolink.co.kr/plus/main' });
    await wait(6000);
    const a = await run(() => {
      const M = t => String(t).replace(/[가-힣]/g, '가').replace(/[0-9]/g, '0').replace(/[A-Za-z]/g, 'a');
      const tb = document.querySelector('#chartSearchTable');
      const form = tb ? (tb.closest('form') || document) : document;
      const fields = [...document.querySelectorAll('select, input, textarea')].filter(e => e.type !== 'hidden' || e.name || e.id).slice(0, 30).map(e => {
        const opts = e.tagName === 'SELECT' ? ' 보기:[' + [...e.options].map(o => o.textContent.trim().slice(0, 10) + '=' + o.value.slice(0, 12)).slice(0, 12).join(', ') + ']' : '';
        const val = e.type === 'hidden' || e.type === 'text' || e.type === 'date' ? ' 값=' + M(e.value).slice(0, 20) : e.type === 'checkbox' ? ' 체크=' + e.checked : '';
        return `${e.tagName.toLowerCase()}[${e.type || ''}] name=${e.name || '-'} id=${e.id || '-'}${val}${opts}`;
      });
      const forms = [...document.querySelectorAll('form')].map(f => `form id=${f.id || '-'} action=${f.getAttribute('action') || '-'} method=${f.method}`);
      const pag = [...document.querySelectorAll('.pagination a, .paging a, [class*=pag] a, [class*=pag] button, [class*=pag] li')].slice(0, 8).map(e => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} "${e.textContent.trim().slice(0, 4)}" ` + [...e.attributes].filter(x => !['class', 'style'].includes(x.name)).map(x => x.name + '=' + String(x.value).replace(/[가-힣]+/g, '가').replace(/\d{3,}/g, '000').slice(0, 100)).join(' '));
      const rows = tb ? [...tb.querySelectorAll('tr.status_data_row')] : [];
      const r0 = rows[0];
      const rowInfo = r0 ? { attrs: [...r0.attributes].map(x => x.name).join(' '), tds: [...r0.children].map(td => td.className + ':' + M(td.textContent.trim()).slice(0, 14)), heads: [...tb.querySelectorAll('th')].map(t => t.textContent.trim()) } : null;
      // 쪽 넘기기·조회 동작 코드 (낱말 문맥)
      const ctx = []; const KW = /goPage|pageNo|page_no|paging|searchChart|chartSearch|loadChartList|getChartList|search_type|visit|sdate|edate|start_date|end_date/gi;
      for (const sc of document.querySelectorAll('script:not([src])')) { const t = sc.textContent; let m; while ((m = KW.exec(t)) && ctx.length < 14) ctx.push('[' + m[0] + '] ' + t.slice(Math.max(0, m.index - 120), m.index + 240).replace(/\s+/g, ' ').replace(/[가-힣]+/g, '가').replace(/\d{3,}/g, '000')); }
      return { forms, fields, pag, n: rows.length, rowInfo, ctx };
    });
    out.push('-- ① /plus/main 목록 --');
    out.push('줄 ' + a.n + '개 · 칸 제목 ' + (a.rowInfo ? a.rowInfo.heads.join(' | ') : '-'));
    if (a.rowInfo) { out.push('줄 속성: ' + a.rowInfo.attrs); out.push('칸: ' + a.rowInfo.tds.join(' | ')); }
    a.forms.forEach(f => out.push(f));
    out.push('입력 칸:'); a.fields.forEach(f => out.push('  ' + f));
    out.push('쪽 넘기기:'); a.pag.forEach(f => out.push('  ' + f));
    out.push('관련 코드:'); [...new Set(a.ctx)].forEach(c => out.push('  ' + c.slice(0, 380)));
    // ③ 진료대기 숨은 부분
    if (tgt) await dbg(tgt, 'Page.navigate', { url: 'https://intolink.co.kr/plus/waitList' });
    await wait(6000);
    const w = await run(() => {
      const M = t => String(t).replace(/[가-힣]/g, '가').replace(/[0-9]/g, '0').replace(/[A-Za-z]/g, 'a');
      const secs = [...document.querySelectorAll('.fixed-tab-content, .wait-content')].map((s, i) => {
        const tbs = [...s.querySelectorAll('table')].map(t => ({ id: t.id, heads: [...t.querySelectorAll('th')].map(x => x.textContent.trim().slice(0, 10)), n: t.querySelectorAll('tbody tr').length, attrs: (t.querySelector('tbody tr td') ? [...t.querySelector('tbody tr td').parentElement.attributes].map(x => x.name + '=' + M(x.value).slice(0, 30)).join(' ') : '') }));
        const head = (s.querySelector('h1,h2,h3,.title,.tit,.text') || {}).textContent || '';
        return `${i}. ${s.className} id=${s.id || '-'} 보임=${s.offsetParent !== null} 제목=${head.trim().slice(0, 20)} · 표 ` + tbs.map(t => `#${t.id || '-'} 줄${t.n} [${t.heads.join('|')}] {${t.attrs}}`).join(' / ') + ` · 글자 ${s.textContent.trim().length}`;
      });
      const tabs = [...document.querySelectorAll('[onclick*=fixedWaitTabClick], [onclick*=fixedSubTabClick]')].map(e => `${e.textContent.trim().slice(0, 12)} → ${e.getAttribute('onclick')}`);
      return { secs, tabs };
    });
    out.push('-- ③ 진료대기 화면의 탭 부분 --');
    w.tabs.forEach(t => out.push('  탭: ' + t));
    w.secs.forEach(s => out.push('  ' + s));
    // ④ 수납완료 화면
    if (tgt) await dbg(tgt, 'Page.navigate', { url: 'https://intolink.co.kr/plus/receiptCompleted' });
    await wait(6000);
    const rc = await run(() => {
      const M = t => String(t).replace(/[가-힣]/g, '가').replace(/[0-9]/g, '0').replace(/[A-Za-z]/g, 'a');
      const tbs = [...document.querySelectorAll('table')].map(t => {
        const rows = [...t.querySelectorAll('tbody tr')].filter(r => r.querySelector('td'));
        const r0 = rows.find(r => r.children.length > 2) || rows[0];
        const inner = r0 ? [r0, ...r0.querySelectorAll('*')].flatMap(e => [...e.attributes]).filter(x => !['class', 'style'].includes(x.name)).map(x => x.name + '=' + String(x.value).replace(/[가-힣]+/g, '가').replace(/\d{3,}/g, '000').slice(0, 60)) : [];
        return `표 #${t.id || '-'} .${String(t.className).split(' ')[0]} 줄 ${rows.length} · 칸 제목 [${[...t.querySelectorAll('th')].map(x => x.textContent.trim().slice(0, 8)).join('|')}] · 첫 줄 칸 ${r0 ? [...r0.children].map(td => M(td.textContent.trim()).slice(0, 10)).join('|') : '-'} · 숨은 값 {${[...new Set(inner)].slice(0, 10).join(' ')}}`;
      });
      const fields = [...document.querySelectorAll('input, select')].slice(0, 12).map(e => `${e.tagName.toLowerCase()}[${e.type}] name=${e.name || '-'} id=${e.id || '-'}`);
      const ctx = []; const KW = /receipt|pay_date|sdate|edate|start_date|end_date|search|getList|loadList/gi;
      for (const sc of document.querySelectorAll('script:not([src])')) { const t = sc.textContent; let m; while ((m = KW.exec(t)) && ctx.length < 8) ctx.push('[' + m[0] + '] ' + t.slice(Math.max(0, m.index - 100), m.index + 220).replace(/\s+/g, ' ').replace(/[가-힣]+/g, '가').replace(/\d{3,}/g, '000')); }
      return { tbs, fields, ctx: [...new Set(ctx)] };
    });
    out.push('-- ④ 수납완료 화면 --');
    rc.tbs.forEach(t => out.push('  ' + t));
    out.push('  입력 칸: ' + rc.fields.join(' / '));
    rc.ctx.forEach(c => out.push('  코드: ' + c.slice(0, 330)));
  } catch (e) { out.push('실패: ' + e.message); }
  try { if (tgt) await chrome.debugger.detach(tgt); } catch (e) {}
  await chrome.storage.session.set({ diag: out.join('\n') });
  await chrome.tabs.create({ url: chrome.runtime.getURL('result.html') });
  try { await chrome.tabs.remove(tab.id); } catch (e) {}
}
chrome.runtime.onMessage.addListener(m => { if (m.t === 'probe3') probe3(); });
