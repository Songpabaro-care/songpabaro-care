// 인투링크에서 읽은 줄 ↔ 환축 목록(동물번호) 맞추기. 미리보기(sync.js)와 실제 연동(offscreen.js)이 같이 씀.
const SB_SKIP = /약\s*처방|전화\s*문의|수납\s*대기|면회/;   // 외래로 등록하지 않고 보류(퇴원 목록)로 두는 접수 항목
function sbNz(s) { return String(s || '').replace(/\s+/g, '').trim(); }
function sbSkipOf(o) { const m = [o.room, o.vet, o.time, o.all].join(' ').match(SB_SKIP); return m ? m[0].replace(/\s+/g, '') : ''; }
function sbMatch(d) {
  const nz = sbNz, pets = d.pets || [];
  const byKey = new Map(); pets.forEach(p => { const k = nz(p.owner) + '|' + nz(p.pet); if (!byKey.has(k)) byKey.set(k, p); });
  const byPet = new Map(); pets.forEach(p => { const k = nz(p.pet); byPet.set(k, byPet.has(k) ? null : p); });
  const findP = o => byKey.get(nz(o.owner) + '|' + nz(o.pet)) || (!o.owner ? byPet.get(nz(o.pet)) || null : null) || byKey.get(nz(o.pet) + '|' + nz(o.owner)) || null;
  // 이름 조금 달라도 (님, 괄호, 끝 숫자, 띄어쓰기) 맞춰 보기
  const nn = x => nz(x).replace(/\(.*?\)/g, '').replace(/님$/, '').replace(/\d+$/, '');
  const fuzzy = o => { const pe = nn(o.pet), ow = nn(o.owner); if (!pe) return null; const c = pets.filter(p => nn(p.pet) === pe && (!ow || !nn(p.owner) || nn(p.owner).includes(ow) || ow.includes(nn(p.owner)))); const u = [...new Set(c.map(p => p.psno))]; return u.length === 1 ? c[0] : null; };
  // 외래 줄(번호 아는 환축)로 '눌렀을 때 실행 코드'의 몇 번째 숫자가 동물번호인지 배우기
  const learn = {};
  (d.opd || []).forEach(o => { const p = findP(o); if (!p || !o.cl) return; o.cl.calls.forEach(c => { const i = c.nums.indexOf(String(p.psno)); if (i >= 0) learn[c.fn] = i; }); });
  // 카드 글자 전체에 목록의 '고객명+동물명'이 둘 다 들어 있으면 그 환축 (카드 글자 모양이 달라도 찾음)
  const inCard = o => { const f = o.full || ''; if (!f) return null;
    let c = pets.filter(p => nz(p.owner).length >= 2 && nz(p.pet) && f.includes(nz(p.owner)) && f.includes(nz(p.pet)));
    if (!c.length) c = pets.filter(p => nz(p.pet).length >= 2 && f.includes(nz(p.pet)));
    const u = [...new Set(c.map(p => p.psno))]; return u.length === 1 ? { ...c[0], psno: u[0], how: '카드 글자' } : null; };
  const byNo = new Map(pets.map(p => [String(p.psno), p]));
  const inpNo = o => { const cl = o.cl || { calls: [], data: {} }, info = n => ({ ...(byNo.get(String(n)) || {}), psno: String(n) });
    if (cl.pno) return { ...info(cl.pno), how: '칸 속 번호' };
    for (const c of cl.calls) if (learn[c.fn] != null && c.nums[learn[c.fn]]) return { ...info(c.nums[learn[c.fn]]), how: '차트 여는 코드' };
    for (const v of [...cl.calls.flatMap(c => c.nums), ...Object.values(cl.data)]) if (byNo.has(String(v))) return { ...info(v), how: '목록과 일치' };
    const p = findP(o) || fuzzy(o) || inCard(o); return p ? { ...p, how: p.how || (p.via === 'search' ? '검색' : '이름') } : null; };
  return { findP, inpNo, learn, byNo };
}
