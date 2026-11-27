// 뒤에서 인투링크 화면을 받아 와 읽기 (탭 없음). 읽기만 하고 인투링크에는 아무것도 쓰지 않음.
const H = 'https://intolink.co.kr';
const nz = s => String(s || '').replace(/\s+/g, '').trim();
async function getDoc(p) {
  const r = await fetch(H + p, { credentials: 'include' });
  const t = await r.text();
  const d = new DOMParser().parseFromString(t, 'text/html');
  d._len = t.length; d._login = /인투통합회원|signIn|LOGIN/.test(t) && !/chartSearchTable|waitListTable|mReceiptCompletedTable/.test(t);
  return d;
}
function cells(tr) { return [...tr.children].map(td => td.textContent.replace(/\s+/g, ' ').trim()); }
function dumpSec(sec) {
  if (!sec) return ['(없음)'];
  const M = t => String(t).replace(/[가-힣]/g, '가').replace(/[0-9]/g, '0').replace(/[A-Za-z]/g, 'a');
  const out = [];
  // 반복되는 묶음(같은 class 형제 여럿)을 찾아 첫 두 개의 구조를 보여 줌
  const cand = [...sec.querySelectorAll('*')].filter(e => e.children.length >= 2 && e.parentElement && [...e.parentElement.children].filter(x => x.className && x.className === e.className).length >= 2);
  const items = cand.length ? [...cand[0].parentElement.children].filter(x => x.className === cand[0].className) : [];
  out.push(`묶음 ${items.length}개 · ${items[0] ? items[0].tagName.toLowerCase() + '.' + String(items[0].className).split(' ').join('.') : '-'}`);
  items.slice(0, 2).forEach((it, i) => {
    const attrs = [it, ...it.querySelectorAll('*')].flatMap(e => [...e.attributes]).filter(x => !['class', 'style'].includes(x.name)).map(x => x.name + '=' + String(x.value).replace(/[가-힣]+/g, '가').replace(/\d{3,}/g, '000').slice(0, 60));
    const leaves = [...it.querySelectorAll('*')].filter(e => !e.children.length && e.textContent.trim()).map(e => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0] + ':' + M(e.textContent.trim()).slice(0, 16));
    out.push(`  ${i + 1}) 글자칸: ${leaves.slice(0, 14).join(' | ')}`);
    out.push(`     숨은 값: ${[...new Set(attrs)].slice(0, 10).join(' ')}`);
  });
  return out;
}
async function collect() {
  const res = { at: Date.now(), err: [], opd: [], pets: [], paid: [], dumps: {} };
  const now = new Date(), yy = String(now.getFullYear()).slice(2), mm = String(now.getMonth() + 1).padStart(2, '0'), dd = String(now.getDate()).padStart(2, '0');
  const today = `${yy}.${mm}.${dd}`;
  try {
    const w = await getDoc('/plus/waitList');
    if (w._login) res.err.push('인투링크 로그인 필요');
    res.opd = [...w.querySelectorAll('#waitListTable tr')].filter(r => r.querySelector('td')).map(r => { const c = cells(r); return { owner: c[0], pet: c[1], time: c[2], vet: c[3], room: c[4], all: c.join(' ') + ' ' + [...r.attributes].map(x => x.value).join(' ') }; });
    res.dumps.all = dumpSec(w.getElementById('fixedWaitTab2Tab1'));
    res.dumps.inp = dumpSec(w.getElementById('fixedWaitTab2Tab2'));
    res.dumps.hot = dumpSec(w.getElementById('fixedWaitTab2Tab3'));
  } catch (e) { res.err.push('진료대기 읽기 실패: ' + e.message); }
  try {
    for (let pg = 1; pg <= 8; pg++) {
      const d = await getDoc('/plus/main?page=' + pg);
      const rows = [...d.querySelectorAll('tr.status_data_row')];
      if (!rows.length) break;
      let older = false;
      rows.forEach(r => { const c = cells(r); const rec = { owner: c[0], phone: c[1], pet: c[2], visit: c[3], psno: r.getAttribute('data-psno'), csno: r.getAttribute('data-csno'), st: (r.children[2] || {}).className || '' }; res.pets.push(rec); if (rec.visit && rec.visit < today) older = true; });
      res.pages = pg;
      if (older) break;
    }
  } catch (e) { res.err.push('환축 목록 읽기 실패: ' + e.message); }
  try {
    const rc = await getDoc('/plus/receiptCompleted');
    res.paid = [...rc.querySelectorAll('#mReceiptCompletedTable tbody tr')].map(cells).filter(c => c.length >= 3 && /^\d{1,2}:\d{2}$/.test(c[0])).map(c => ({ time: c[0], owner: c[1], pet: c[2] }));
  } catch (e) { res.err.push('수납완료 읽기 실패: ' + e.message); }
  res.today = today;
  return res;
}
chrome.runtime.onMessage.addListener((m, s, send) => { if (m.t === 'collect' && m.to === 'off') { collect().then(send, e => send({ err: [e.message] })); return true; } });
