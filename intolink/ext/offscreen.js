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
async function collect(opt = {}) {
  const deep = opt.deep !== false;
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
  } catch (e) { res.err.push('진료대기 읽기 실패: ' + e.message); }
  try {
    // 오늘 온 환축 + 지금 입원·호텔 중인 환축의 입원일까지 거슬러 읽기 (최대 25쪽)
    let until = today;
    (res.inp || []).forEach(o => { const m = String(o.dt || '').match(/^\d{2}(\d{2})-(\d{2})-(\d{2})/); if (m) { const v = `${m[1]}.${m[2]}.${m[3]}`; if (v < until) until = v; } });
    res.until = until;
    if (!deep) until = today;
    for (let pg = 1; pg <= (until < today ? 25 : 10); pg++) {
      const d = await getDoc('/plus/main?page=' + pg);
      const rows = [...d.querySelectorAll('tr.status_data_row')];
      if (!rows.length) break;
      let older = false;
      rows.forEach(r => { const c = cells(r); const rec = { owner: c[0], phone: c[1], pet: c[2], visit: c[3], psno: r.getAttribute('data-psno'), csno: r.getAttribute('data-csno'), hidx: r.getAttribute('data-hsptl_idx'), st: (r.children[2] || {}).className || '' }; res.pets.push(rec); if (rec.visit && rec.visit < until) older = true; });
      res.pages = pg;
      if (older) break;
    }
  } catch (e) { res.err.push('환축 목록 읽기 실패: ' + e.message); }
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
// 🔄 맞추기용: 진료대기 페이지 '한 번만' 받아서 외래·입원·호텔 명단과 동물번호 읽기 (다른 페이지는 받지 않음)
// 동물번호: 칸 속 번호 → 차트 여는 코드의 몇 번째 숫자(케어 노트 카드로 배움) → 케어 노트 번호와 하나만 일치. 못 찾으면 '번호 못 찾음'(추측 안 함)
async function collectWait(q = {}) {
  const res = { at: Date.now(), err: [], items: [], unknown: [], learn: { ...(q.learn || {}) }, nOpd: 0, nInp: 0 };
  const now = new Date(), mm = String(now.getMonth() + 1).padStart(2, '0'), dd = String(now.getDate()).padStart(2, '0'), ymd = `${now.getFullYear()}-${mm}-${dd}`;
  let w;
  try { w = await getDoc('/plus/waitList'); } catch (e) { res.err.push('진료대기 읽기 실패: ' + e.message); return res; }
  if (w._login) { res.err.push('인투링크 로그인 필요 · 접수실 크롬에서 인투링크에 다시 로그인해 주세요'); return res; }
  if (!w.getElementById('waitListTable') && !w.getElementById('fixedWaitTab2Tab2') && !w.getElementById('fixedWaitTab2Tab3')) { res.err.push('진료대기 화면 모양이 예전과 달라요 · 아무것도 바꾸지 않았어요'); return res; }
  const opd = [...w.querySelectorAll('#waitListTable tr')].filter(r => r.querySelector('td')).map(r => { const c = cells(r); return { kind: '외래', owner: c[0], pet: c[1], time: c[2], vet: c[3], room: c[4], all: c.join(' '), cl: clues(r) }; }).filter(o => String(o.time || '').startsWith(ymd));
  const inp = [...readInner(w.getElementById('fixedWaitTab2Tab2'), '입원'), ...readInner(w.getElementById('fixedWaitTab2Tab3'), '호텔')].filter(o => !o.old);
  res.nOpd = opd.length; res.nInp = inp.length;
  const pets = q.pets || [], K = new Set(pets.map(p => String(p.psno)));
  const nn = x => nz(x).replace(/\(.*?\)/g, '').replace(/님$/, '').replace(/\d+$/, '');
  const byName = new Map(); pets.forEach(p => { const k = nn(p.pet); if (!k) return; if (!byName.has(k)) byName.set(k, new Set()); byName.get(k).add(String(p.psno)); });
  const uniq = name => { const s = byName.get(nn(name)); return s && s.size === 1 ? [...s][0] : ''; };
  // 차트 여는 코드의 몇 번째 숫자가 동물번호인지: 이름이 하나뿐인 케어 노트 카드로 배우기
  [...opd, ...inp].forEach(o => { const ps = uniq(o.pet); if (!ps) return; o.cl.calls.forEach(c => { const i = c.nums.indexOf(ps); if (i >= 0) res.learn[c.fn] = i; }); });
  const numOf = o => { const cl = o.cl || { calls: [], data: {} };
    if (cl.pno) return [String(cl.pno), '칸 속 번호'];
    for (const c of cl.calls) { const i = res.learn[c.fn]; if (i != null && c.nums[i]) return [String(c.nums[i]), '차트 여는 코드']; }
    const hit = [...new Set([...cl.calls.flatMap(c => c.nums), ...Object.values(cl.data)].map(String).filter(v => K.has(v)))];
    if (hit.length === 1) return [hit[0], '케어 노트 번호와 일치'];
    return ['', '']; };
  [...opd, ...inp].forEach(o => { const [ps, how] = numOf(o);
    const it = { kind: o.kind, pet: String(o.pet || '').slice(0, 30), sp: o.sp || '', room: o.kind === '외래' ? '' : String(o.room || '').slice(0, 30), hold: o.kind === '외래' ? sbSkipOf(o) : '' };
    if (ps) res.items.push({ ...it, psno: ps, how }); else res.unknown.push(it); });
  return res;
}
chrome.runtime.onMessage.addListener((m, s, send) => {
  if (m.t === 'collect' && m.to === 'off') { collect(m.opt || {}).then(send, e => send({ err: [e.message] })); return true; }
  if (m.t === 'collectWait' && m.to === 'off') { collectWait(m.q || {}).then(send, e => send({ err: [e.message] })); return true; }
  if (m.t === 'petinfo' && m.to === 'off') { petInfo(m.q).then(send, e => send({ err: e.message })); return true; }
});
