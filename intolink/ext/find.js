// 🔎 번호 나오는 화면 찾기: 인투링크 화면들을 폰·PC 모드로 열어 보고 표 칸 제목과 번호 모양 칸을 보고 (값은 가림)
const FIND_START = ['/plus/main', '/plus/waitList', '/mylink/hospital', '/kiosk/visitManage', '/refer/main', '/'];
const FIND_SKIP = /logout|delete|del|remove|cancel|send|kakao|push|join|policy|term|privacy|notice|cscenter|faq|download|excel|print|pay|setting|sso|pwa|manifest|\.(png|jpg|pdf|js|css)/i;
async function pageSummary(tabId) {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: () => {
    const M = s => String(s).replace(/[가-힣]/g, '가').replace(/[0-9]/g, '0').replace(/[A-Za-z]/g, 'a');
    const tables = [...document.querySelectorAll('table')].slice(0, 6).map(t => {
      const ths = [...t.querySelectorAll('th')].map(x => x.textContent.trim().replace(/\s+/g, ' ').slice(0, 12));
      const rows = [...t.querySelectorAll('tbody tr')];
      const numCols = [];
      if (rows.length) {
        const w = Math.max(...rows.slice(0, 10).map(r => r.children.length));
        for (let c = 0; c < w; c++) {
          const vals = rows.slice(0, 10).map(r => (r.children[c] || {}).textContent || '').map(v => v.trim());
          const n = vals.filter(v => /^\d{3,8}$/.test(v)).length;
          if (n >= Math.max(1, Math.floor(vals.length / 2))) numCols.push((ths[c] || ('칸' + (c + 1))) + ' ' + M(vals.find(v => v)));
        }
      }
      return { ths, n: rows.length, numCols, first: rows[0] ? [...rows[0].children].map(td => M(td.textContent.trim().slice(0, 14))) : [] };
    });
    // 표가 아닌 목록에서 번호 모양 글자 (예: NO. 0000)
    let nums = 0; const lab = new Set();
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) { const t = tw.currentNode.textContent.trim(); if (/^(no\.?|번호|#)?\s*\d{3,8}$/i.test(t)) { nums++; const p = tw.currentNode.parentElement; if (p) lab.add(p.tagName.toLowerCase() + (p.className && typeof p.className === 'string' ? '.' + p.className.split(' ')[0] : '')); } }
    const links = [...new Set([...document.querySelectorAll('a[href]')].map(a => { try { const u = new URL(a.href, location.href); return /(^|\.)intolink\.co\.kr$/.test(u.hostname) && u.hostname.indexOf('sso') < 0 ? u.pathname : ''; } catch (e) { return ''; } }).filter(Boolean))];
    return { path: location.pathname, host: location.hostname, title: document.title, len: document.body ? document.body.innerText.length : 0, tables, nums, lab: [...lab].slice(0, 5), links };
  } });
  return r.result;
}
async function findPages() {
  const out = ['== 🔎 번호 나오는 화면 찾기 ' + new Date().toLocaleString('ko-KR') + ' =='];
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  const hits = [];
  for (const mode of ['폰', 'PC']) {
    let tgt = null;
    if (mode === '폰') { try { tgt = await mobileTab(tab.id); } catch (e) { out.push('폰 모드 실패: ' + e.message); continue; } }
    const queue = FIND_START.slice(), seen = new Set();
    let visited = 0;
    while (queue.length && visited < 22) {
      const p = queue.shift(); if (seen.has(p)) continue; seen.add(p);
      if (FIND_SKIP.test(p)) continue;
      visited++;
      try {
        await chrome.tabs.update(tab.id, { url: 'https://intolink.co.kr' + p });
        await new Promise(r => setTimeout(r, 3500));
        const s = await pageSummary(tab.id);
        if (s.host.indexOf('sso') >= 0) { out.push(`[${mode}] ${p} → 로그인 화면으로 넘어감`); continue; }
        const good = s.tables.some(t => t.numCols.length) || s.nums >= 3;
        const line = `[${mode}] ${s.path} · 제목 ${s.title.slice(0, 20)} · 글자 ${s.len}` + (good ? '  ★번호 있음' : '');
        out.push(line);
        s.tables.forEach((t, i) => { if (t.ths.length || t.n) out.push(`    표${i + 1} 줄 ${t.n} · 칸 [${t.ths.join('] [')}]` + (t.numCols.length ? '  번호 칸: ' + t.numCols.join(', ') : '') + (t.first.length ? '\n      첫 줄: ' + t.first.join(' | ') : '')); });
        if (s.nums) out.push(`    번호 모양 글자 ${s.nums}개 (${s.lab.join(', ')})`);
        if (good) hits.push(line);
        if (FIND_START.includes(p)) for (const l of s.links) if (!seen.has(l) && !FIND_SKIP.test(l)) queue.push(l);
      } catch (e) { out.push(`[${mode}] ${p} → 실패 ${e.message}`); }
    }
    if (tgt) { try { await chrome.debugger.detach(tgt); } catch (e) {} }
  }
  out.splice(1, 0, '-- 번호가 보이는 화면 --', ...(hits.length ? hits : ['(못 찾음)']), '-- 전체 --');
  await chrome.storage.session.set({ diag: out.join('\n') });
  await chrome.tabs.create({ url: chrome.runtime.getURL('result.html') });
  try { await chrome.tabs.remove(tab.id); } catch (e) {}
}
chrome.runtime.onMessage.addListener(m => { if (m.t === 'find') findPages(); });
