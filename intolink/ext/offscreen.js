// 뒤에서 인투링크 화면을 받아 와 읽기 (탭 없음). 읽기만 하고 인투링크에는 아무것도 쓰지 않음.
const H = 'https://intolink.co.kr';
const nz = s => String(s || '').replace(/\s+/g, '').trim();
async function getDoc(p) {
  const r = await fetch(H + p, { credentials: 'include' });
  const t = await r.text();
  // 읽기만 하므로 onclick 같은 인라인 실행 코드를 미리 지워 둠 (크롬 보안 경고 방지)
  const safe = t.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/(href|src|action)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
  const d = new DOMParser().parseFromString(safe, 'text/html');
  d._len = t.length; d._raw = safe; d._login = /인투통합회원|signIn|LOGIN/.test(t) && !/chartSearchTable|waitListTable|mReceiptCompletedTable/.test(t);
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
// 입원·호텔 칸(div.wait-inner) 읽기: 글자칸 순서대로
function readInner(sec, kind) {
  if (!sec) return [];
  return [...sec.querySelectorAll('.wait-inner')].map(it => {
    const t = [...it.querySelectorAll('*')].filter(e => !e.children.length && e.textContent.trim() && !e.classList.contains('slash')).map(e => e.textContent.replace(/\s+/g, ' ').trim());
    const first = t[0] || '';
    let owner = '', pet = '';
    let m = first.match(/^(.+?)\s*\/\s*(.+)$/);
    if (m) { owner = m[1]; pet = m[2]; } else if ((m = first.match(/^(.+?)\((.+?)\)\s*\d*$/))) { pet = m[1]; owner = m[2]; } else pet = first;
    const dt = t.find(x => /^\d{4}-\d{2}-\d{2}/.test(x)) || '';
    const sp = t.find(x => /^(Canine|Feline|Exotic|Avian|Rabbit|Other)/i.test(x)) || '';
    let old = false; const dm = dt.match(/^(\d{4})-(\d{2})-(\d{2}).*?\((\d+)\s*일\)/);
    if (dm) { const since = Math.round((new Date(new Date().toDateString()) - new Date(+dm[1], dm[2] - 1, +dm[3])) / 864e5); old = Math.abs(since - +dm[4]) > 1; }
    return { kind, owner, pet, first, dt, sp, room: t[t.length - 1] || '', texts: t.length, old };
  });
}
// 이름으로 /plus/main 검색해서 동물번호 찾기
const SLOG = [];
async function searchPet(q) {
  try {
    const d = await getDoc('/plus/main?searchText=' + encodeURIComponent(q));
    const rs = [...d.querySelectorAll('tr.status_data_row')];
    SLOG.push({ rows: rs.length, hit: rs.filter(r => (r.textContent || '').replace(/\s+/g, '').includes(nz(q))).length });
    return [...d.querySelectorAll('tr.status_data_row')].map(r => { const c = cells(r); return { owner: c[0], phone: c[1], pet: c[2], visit: c[3], psno: r.getAttribute('data-psno'), csno: r.getAttribute('data-csno'), st: (r.children[2] || {}).className || '', via: 'search' }; });
  } catch (e) { return []; }
}
// 검색창 모양 (이름·값은 안 읽음: 칸 이름과 선택지 글자만)
function formDiag(d) {
  const out = [];
  try {
    const inp = d.querySelector('[name="searchText"]') || d.querySelector('input[type="search"], input[placeholder*="검색"]');
    const f = inp && inp.closest('form');
    out.push('검색칸: ' + (inp ? `${inp.tagName} name=${inp.name || '-'} id=${inp.id || '-'}` : '없음'));
    if (f) {
      out.push(`form action=${f.getAttribute('action') || '-'} method=${f.getAttribute('method') || 'get'} id=${f.id || '-'}`);
      f.querySelectorAll('input,select,textarea').forEach(e => out.push(` - ${e.tagName.toLowerCase()} ${e.type || ''} name=${e.name || '-'}` + (e.tagName === 'SELECT' ? ' [' + [...e.options].map(o => o.value + ':' + o.text.trim()).join(', ') + ']' : '')));
    } else if (inp) out.push('form 없음 (스크립트로 검색)');
    const raw = d._raw || '', re = /searchText|chartSearch|searchKeyword|search_text/g; let m, k = 0;
    while ((m = re.exec(raw)) && k++ < 6) out.push('… ' + raw.slice(Math.max(0, m.index - 90), m.index + 110).replace(/\s+/g, ' ').replace(/[가-힣]+/g, '가'));
  } catch (e) { out.push('진단 실패: ' + e.message); }
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
    const ymd = `${now.getFullYear()}-${mm}-${dd}`;
    res.opdOld = res.opd.filter(o => !String(o.time || '').startsWith(ymd)).length;
    res.opd = res.opd.filter(o => String(o.time || '').startsWith(ymd));
    const inAll = [...readInner(w.getElementById('fixedWaitTab2Tab2'), '입원'), ...readInner(w.getElementById('fixedWaitTab2Tab3'), '호텔')];
    res.inpOld = inAll.filter(o => o.old); res.inp = inAll.filter(o => !o.old);
    res.dumps.all = dumpSec(w.getElementById('fixedWaitTab2Tab1'));
    res.dumps.inp = dumpSec(w.getElementById('fixedWaitTab2Tab2'));
    res.dumps.hot = dumpSec(w.getElementById('fixedWaitTab2Tab3'));
  } catch (e) { res.err.push('진료대기 읽기 실패: ' + e.message); }
  try {
    for (let pg = 1; pg <= 8; pg++) {
      const d = await getDoc('/plus/main?page=' + pg);
      if (pg === 1) res.form = formDiag(d);
      const rows = [...d.querySelectorAll('tr.status_data_row')];
      if (!rows.length) break;
      let older = false;
      rows.forEach(r => { const c = cells(r); const rec = { owner: c[0], phone: c[1], pet: c[2], visit: c[3], psno: r.getAttribute('data-psno'), csno: r.getAttribute('data-csno'), st: (r.children[2] || {}).className || '' }; res.pets.push(rec); if (rec.visit && rec.visit < today) older = true; });
      res.pages = pg;
      if (older) break;
    }
  } catch (e) { res.err.push('환축 목록 읽기 실패: ' + e.message); }
  try {
    const have = new Set(res.pets.map(p => nz(p.owner) + '|' + nz(p.pet)));
    const need = [...res.opd, ...(res.inp || [])].filter(o => o.pet && !have.has(nz(o.owner) + '|' + nz(o.pet)));
    let n = 0; res.searched = 0; SLOG.length = 0; res.slog = SLOG;
    for (const o of need) {
      if (n++ >= 12) break;
      const hits = await searchPet(o.owner || o.pet);
      res.searched++;
      hits.forEach(h => { const k = nz(h.owner) + '|' + nz(h.pet); if (!have.has(k)) { have.add(k); res.pets.push(h); } });
    }
  } catch (e) { res.err.push('이름 검색 실패: ' + e.message); }
  try {
    const rc = await getDoc('/plus/receiptCompleted');
    const ymd2 = `${now.getFullYear()}-${mm}-${dd}`;
    const prow = [...rc.querySelectorAll('#mReceiptCompletedTable tbody tr')].map(cells).filter(c => c.length >= 3);
    res.paidRaw = prow.length; res.paidHead = prow.slice(0, 3).map(c => c[0].replace(/[가-힣]/g, '가'));
    res.paid = prow.filter(c => /\d{1,2}:\d{2}/.test(c[0]) && (!/\d{4}-\d{2}-\d{2}/.test(c[0]) || c[0].includes(ymd2))).map(c => ({ time: c[0], owner: c[1], pet: c[2] }));
  } catch (e) { res.err.push('수납완료 읽기 실패: ' + e.message); }
  res.today = today;
  return res;
}
chrome.runtime.onMessage.addListener((m, s, send) => { if (m.t === 'collect' && m.to === 'off') { collect().then(send, e => send({ err: [e.message] })); return true; } });
