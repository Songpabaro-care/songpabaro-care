// 뒤에서 인투링크 화면을 받아 와 읽기 (탭 없음). 읽기만 하고 인투링크에는 아무것도 쓰지 않음.
const H = 'https://intolink.co.kr';
const nz = s => String(s || '').replace(/\s+/g, '').trim();
async function getDoc(p) {
  const r = await fetch(H + p, { credentials: 'include' });
  const t = await r.text();
  // 읽기만 하므로 onclick 같은 인라인 실행 코드를 미리 지워 둠 (크롬 보안 경고 방지)
  const safe = t.replace(/\son([a-z]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ' data-sbon-$1=$2').replace(/(href|src|action)\s*=\s*"\s*javascript:([^"]*)"/gi, 'data-sbon-$1="$2" $1="#"').replace(/(href|src|action)\s*=\s*'\s*javascript:([^']*)'/gi, "data-sbon-$1='$2' $1=\"#\"");
  const d = new DOMParser().parseFromString(safe, 'text/html');
  d._len = t.length; d._raw = t; d._login = /인투통합회원|signIn|LOGIN/.test(t) && !/chartSearchTable|waitListTable|mReceiptCompletedTable/.test(t);
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
// 칸 안에 숨은 동물번호 단서: pet_no= 같은 값, data-* 값, 눌렀을 때 실행 코드(함수 이름 + 숫자들)
function clues(el) {
  const h = el.outerHTML;
  const m = h.match(/(?:pet_?no|psno|pet_?idx|petNo|petIdx|animal_?no)['"]?\s*[:=]\s*['"]?(\d+)/i);
  const els = [el, ...el.querySelectorAll('*')];
  for (let a = el.parentElement, k = 0; a && k < 2; a = a.parentElement, k++) els.push(a);
  const calls = [];
  els.forEach(e => [...e.attributes].forEach(x => { if (/^data-sbon-/.test(x.name)) { const c = x.value.match(/([A-Za-z_$][\w$.]*)\s*\(([^)]*)\)/); if (c) calls.push({ fn: c[1], nums: (c[2].match(/\d+/g) || []) }); } }));
  const data = {}; els.forEach(e => [...e.attributes].forEach(x => { if (/^data-(?!sbon)/.test(x.name) && /^\d+$/.test(x.value)) data[x.name] = x.value; }));
  return { pno: m ? m[1] : (data['data-psno'] || data['data-pet_no'] || data['data-petno'] || ''), calls, data };
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
    return { kind, owner, pet, first, dt, sp, room: t[t.length - 1] || '', texts: t.length, old, cl: clues(it), full: nz(t.join('')) };
  });
}
// 이름으로 /plus/main 검색해서 동물번호 찾기
const SLOG = [];
async function searchPet(q) {
  try {
    const d = await getDoc('/plus/main?searchText=' + encodeURIComponent(q));
    const rs = [...d.querySelectorAll('tr.status_data_row')];
    SLOG.push({ rows: rs.length, hit: rs.filter(r => (r.textContent || '').replace(/\s+/g, '').includes(nz(q))).length });
    return [...d.querySelectorAll('tr.status_data_row')].map(r => { const c = cells(r); return { owner: c[0], phone: c[1], pet: c[2], visit: c[3], psno: r.getAttribute('data-psno'), csno: r.getAttribute('data-csno'), hidx: r.getAttribute('data-hsptl_idx'), st: (r.children[2] || {}).className || '', via: 'search' }; });
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
    while ((m = re.exec(raw)) && k++ < 6) out.push('… ' + raw.slice(Math.max(0, m.index - 90), m.index + 110).replace(/\s+/g, ' ').replace(/[가-힣]+/g, '가').replace(/\d/g, '0').replace(/>[^<]{1,40}</g, '>…<'));
  } catch (e) { out.push('진단 실패: ' + e.message); }
  return out;
}
// 화면이 뒤에서 데이터를 받아 오는 주소(API) 찾기: 스크립트 속 '/주소' 글자만 모음 (숫자는 0으로)
async function apiDiag() {
  const out = {}, seenJs = new Set(); let jsN = 0;
  const LIB = /jquery|vue(\.min)?\.js|bootstrap|moment|lodash|axios|swiper|select2|datepicker|polyfill|chart\.js|fontawesome|gtag|analytics/i;
  const scan = txt => { const r = new Map(), re = /()['"`]((?:https?:\/\/[a-z0-9.\-]*intolink[a-z0-9.\-]*)?\/[A-Za-z][A-Za-z0-9_\-]*(?:\/[A-Za-z0-9_\.\-]*)*)(\?[^'"`\s]{0,40})?['"`]/gi; let m;
    while ((m = re.exec(txt))) { const u = (m[2] + (m[3] || '')).replace(/\d/g, '0').replace(/[가-힣]+/g, '가'); if (/\.(css|png|jpe?g|gif|svg|ico|woff2?|ttf|eot|map|html?|js)$/i.test(m[2]) || /^\/(img|images|css|fonts?|static\/img)\//i.test(m[2]) || r.size >= 120) continue; const k = ((txt.slice(Math.max(0, m.index - 60), m.index).match(/\b(post|get|ajax|axios|fetch|url|action|href|location)\b/gi) || []).pop() || '').toLowerCase(); r.set(u, (r.get(u) || '') + (k && !(r.get(u) || '').includes(k) ? k + ' ' : '')); }
    return r; };
  for (const p of ['/plus/main', '/plus/receiptCompleted', '/plus/waitList']) {
    try {
      const d = await getDoc(p), all = scan(d._raw || ''), code = [];
      const srcs = [...d.querySelectorAll('script[src]')].map(e => e.getAttribute('src')).filter(u => u && !LIB.test(u) && (u.includes('intolink.co.kr') || !/^(https?:)?\/\//.test(u)));
      for (const u of srcs) { if (seenJs.has(u) || jsN >= 20) continue; seenJs.add(u); jsN++;
        try { const rr = await fetch(new URL(u, H + p).href, { credentials: 'include' }); const t = await rr.text(); if (!rr.ok) code.push(`(${u.replace(/^.*\//, '')} 못 받음 ${rr.status})`);
          scan(t).forEach((v, k) => all.set(k, (all.get(k) || '') + v));
          // 이 화면 전용 스크립트: 데이터를 받아 오는 코드 부분을 그대로 (한글은 가, 숫자는 0)
          if (/ge_plus|\/wait\/|receipt|status_client/i.test(u)) { const re2 = /\$\.ajax|\$\.post|\$\.get|axios|fetch\(|url\s*:|\.post\(|\.get\(/g; let m2, n2 = 0, last = -999;
            while ((m2 = re2.exec(t)) && n2 < 10) { if (m2.index - last < 160) continue; last = m2.index; n2++; code.push(`[${u.replace(/^.*\//, '')}] ` + t.slice(Math.max(0, m2.index - 60), m2.index + 220).replace(/\s+/g, ' ').replace(/[가-힣]+/g, '가').replace(/\d/g, '0')); }
            if (!n2) code.push(`[${u.replace(/^.*\//, '')}] 데이터 받는 코드 못 찾음 · 길이 ${t.length} · 앞부분: ` + t.slice(0, 200).replace(/\s+/g, ' ').replace(/[가-힣]+/g, '가').replace(/\d/g, '0')); }
        } catch (e) { code.push(`(${u.replace(/^.*\//, '')} 받기 실패: ${e.message})`); } }
      out[p] = { js: srcs.map(u => u.replace(/\?.*$/, '')), urls: [...all].map(([u, k]) => u + (k ? '  ← ' + k.trim() : '')), code };
    } catch (e) { out[p] = { err: e.message }; }
  }
  return out;
}
async function collect(opt = {}) {
  const deep = opt.deep !== false, diag = !!opt.diag;
  const res = { at: Date.now(), err: [], opd: [], pets: [], paid: [], dumps: {} };
  const now = new Date(), yy = String(now.getFullYear()).slice(2), mm = String(now.getMonth() + 1).padStart(2, '0'), dd = String(now.getDate()).padStart(2, '0');
  const today = `${yy}.${mm}.${dd}`;
  try {
    const w = await getDoc('/plus/waitList');
    if (w._login) res.err.push('인투링크 로그인 필요');
    res.opd = [...w.querySelectorAll('#waitListTable tr')].filter(r => r.querySelector('td')).map(r => { const c = cells(r); return { owner: c[0], pet: c[1], time: c[2], vet: c[3], room: c[4], cls: [r.className, ...[...r.querySelectorAll('[class*=status], [class*=color]')].map(e => e.className)].filter(Boolean).join(' ').slice(0, 120), all: c.join(' ') + ' ' + [...r.attributes].filter(x => !/^data-sbon/.test(x.name)).map(x => x.value).join(' '), cl: clues(r) }; });
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
    // 오늘 온 환축 + 지금 입원·호텔 중인 환축의 입원일까지 거슬러 읽기 (최대 25쪽)
    let until = today;
    (res.inp || []).forEach(o => { const m = String(o.dt || '').match(/^\d{2}(\d{2})-(\d{2})-(\d{2})/); if (m) { const v = `${m[1]}.${m[2]}.${m[3]}`; if (v < until) until = v; } });
    res.until = until;
    if (!deep) until = today;
    for (let pg = 1; pg <= (until < today ? 25 : 10); pg++) {
      const d = await getDoc('/plus/main?page=' + pg);
      if (pg === 1 && diag) res.form = formDiag(d);
      const rows = [...d.querySelectorAll('tr.status_data_row')];
      if (!rows.length) break;
      let older = false;
      rows.forEach(r => { const c = cells(r); const rec = { owner: c[0], phone: c[1], pet: c[2], visit: c[3], psno: r.getAttribute('data-psno'), csno: r.getAttribute('data-csno'), hidx: r.getAttribute('data-hsptl_idx'), st: (r.children[2] || {}).className || '' }; res.pets.push(rec); if (rec.visit && rec.visit < until) older = true; });
      res.pages = pg;
      if (older) break;
    }
  } catch (e) { res.err.push('환축 목록 읽기 실패: ' + e.message); }
  try {
    const have = new Set(res.pets.map(p => nz(p.owner) + '|' + nz(p.pet)));
    const need = [...res.opd, ...(res.inp || [])].filter(o => o.pet && !have.has(nz(o.owner) + '|' + nz(o.pet)));
    let n = 0; res.searched = 0; SLOG.length = 0; res.slog = SLOG;
    for (const o of need) {
      if (!diag || n++ >= 12) break;
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
  if (diag) { try { res.api = await apiDiag(); } catch (e) { res.err.push('API 찾기 실패: ' + e.message); } }
  // 실제 연동용: 줄마다 동물번호 붙이기
  try { const M = sbMatch(res);
    res.items = [...res.opd.map(o => { const p = M.findP(o); return { kind: '외래', psno: p ? String(p.psno) : '', csno: p && p.csno || '', hidx: p && p.hidx || '', pet: o.pet, hold: sbSkipOf(o), cls: o.cls || '', time: o.time }; }),
      ...(res.inp || []).map(o => { const p = M.inpNo(o); return { kind: o.kind, psno: p ? String(p.psno) : '', csno: p && p.csno || '', hidx: p && p.hidx || '', pet: o.pet, sp: o.sp, room: o.room, full: o.full, dt: o.dt }; })];
  } catch (e) { res.err.push('번호 맞추기 실패: ' + e.message); }
  res.today = today;
  return res;
}
// 새로 등록할 환축의 종·품종·성별·생일·체중 (차트 상세 화면 글자에서)
async function petInfo(q) {
  const out = {};
  try { const d = await getDoc(`/plus/petChart?hsptl_idx=${encodeURIComponent(q.hidx || '')}&pet_no=${encodeURIComponent(q.psno)}&c_no=${encodeURIComponent(q.csno || '')}`);
    const L = [...d.querySelectorAll('body *')].filter(e => !e.children.length && e.textContent.trim()).map(e => e.textContent.replace(/\s+/g, ' ').trim());
    const g = lab => { for (let i = 0; i < L.length; i++) { const x = L[i].replace(/\s/g, ''); if (x === lab || x === lab + ':' || x.startsWith(lab + ':')) { const rest = L[i].replace(new RegExp('^\\s*' + lab.split('').join('\\s*') + '\\s*:?\\s*'), ''); return (rest || L[i + 1] || '').trim(); } } return ''; };
    const sp = g('종'), all = L.join(' ');
    out.sp = /Feline|고양이/i.test(sp) || (!sp && /Feline/.test(all) && !/Canine/.test(all)) ? 'cat' : 'dog';
    out.breed = g('품종').slice(0, 30); out.sex = g('성별').slice(0, 20);
    out.birth = (g('생년월일').match(/\d{4}-\d{2}-\d{2}/) || [''])[0]; out.bw = (g('체중').match(/[\d.]+/) || [''])[0]; out.name = g('동물이름').slice(0, 20);
    out.found = !!sp;
  } catch (e) { out.err = e.message; }
  return out;
}
chrome.runtime.onMessage.addListener((m, s, send) => {
  if (m.t === 'collect' && m.to === 'off') { collect(m.opt || { diag: true }).then(send, e => send({ err: [e.message] })); return true; }
  if (m.t === 'petinfo' && m.to === 'off') { petInfo(m.q).then(send, e => send({ err: e.message })); return true; }
});
