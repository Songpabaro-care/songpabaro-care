// 👀 연동 미리보기: 케어 노트로는 아무것도 보내지 않음. 이름은 기본으로 가림.
const $ = s => document.querySelector(s);
const nz = s => String(s || '').replace(/\s+/g, '').trim();
const mask = s => String(s || '').replace(/[가-힣]/g, '가').replace(/[A-Za-z]/g, 'a');
let DATA = null;
// 외래로 등록하지 않고 퇴원 처리하는 접수 항목 (진료실·담당의·접수 내용 어디에 있어도)
const SKIP = /미용|약\s*처방|전화\s*문의|수납\s*대기|면회/;
const skipOf = o => { const m = [o.room, o.vet, o.time, o.all].join(' ').match(SKIP); return m ? m[0].replace(/\s+/g, '') : ''; };
function show(v) { return $('#real').checked ? (v || '') : mask(v); }
function render() {
  const d = DATA; if (!d) return;
  const byKey = new Map(); d.pets.forEach(p => { const k = nz(p.owner) + '|' + nz(p.pet); if (!byKey.has(k)) byKey.set(k, p); });
  const byPet = new Map(); d.pets.forEach(p => { const k = nz(p.pet); byPet.set(k, byPet.has(k) ? null : p); });
  const findP = o => byKey.get(nz(o.owner) + '|' + nz(o.pet)) || (!o.owner ? byPet.get(nz(o.pet)) || null : null) || byKey.get(nz(o.pet) + '|' + nz(o.owner)) || null;
  const paid = new Set(d.paid.map(p => nz(p.owner) + '|' + nz(p.pet)));
  let found = 0, skipped = 0, inFound = 0;
  const rows = d.opd.map(o => { const k = nz(o.owner) + '|' + nz(o.pet), p = findP(o), sk = skipOf(o); if (p) found++; if (sk) skipped++;
    const act = sk ? `<b style="color:#b26a00">보류 (${sk}) · 외래 카드는 퇴원 목록으로 (지우지 않음)</b>` : paid.has(k) ? '✅ 수납완료 → 정리' : '외래 등록 (퇴원 목록에 있으면 복원)';
    return `<tr${sk ? ' style="background:#fff6e5"' : ''}><td>${show(o.owner)}</td><td>${show(o.pet)}</td><td>${o.time || ''}</td><td>${o.room || ''}</td><td>${p ? '#' + p.psno : '<b style="color:#c33">못 찾음</b>'}</td><td>${act}</td><td style="color:#888">${p ? p.st : ''}</td></tr>`; }).join('');
  $('#out').innerHTML = `
  <p>읽은 시각 ${new Date(d.at).toLocaleTimeString('ko-KR')} · 오늘 ${d.today} · 환축 목록 ${d.pages || 0}쪽 + 이름 검색 ${d.searched || 0}번 · 번호 아는 환축 ${d.pets.length}마리 · 수납완료 ${d.paid.length}건 · 오늘 아닌 옛 대기 줄 ${d.opdOld || 0}개 (제외)</p>
  ${d.err.length ? `<p style="color:#c33">⚠ ${d.err.join(' / ')}</p>` : ''}
  <h3>외래대기 ${d.opd.length}마리 · 동물번호 찾음 ${found} · 보류(미용·약처방·전화문의·수납대기·면회) ${skipped}</h3><p style="color:#666">인투벳에서 접수 취소돼 대기 목록에서 사라진 환축은 실제 연동(1.3)에서 케어 노트에서도 지워요.</p>
  <table><tr><th>고객명</th><th>동물명</th><th>접수일시</th><th>진료실</th><th>동물번호</th><th>케어 노트에서</th><th>상태 표시</th></tr>${rows}</table>
  <h3>입원·호텔 ${(d.inp || []).length}마리 · 동물번호 찾음 <span id="inF"></span></h3>
  <table><tr><th>구분</th><th>고객명</th><th>동물명</th><th>입원 일시</th><th>종</th><th>입원실</th><th>동물번호</th><th>케어 노트에서</th></tr>${(d.inp || []).map(o => { const p = findP(o); if (p) inFound++; return `<tr><td>${o.kind}</td><td>${show(o.owner)}</td><td>${show(o.pet)}</td><td>${o.dt || ''}</td><td>${o.sp || ''}</td><td>${show(o.room)}</td><td>${p ? '#' + p.psno + (p.via === 'search' ? ' <small>(검색)</small>' : '') : '<b style="color:#c33">못 찾음</b>'}</td><td>${o.kind} 카드로 등록·구분 맞춤</td></tr>`; }).join('')}</table>
  <details><summary>입원·호텔 부분 모양 (가림)</summary><h3>입원·호텔 부분 모양 (가림)</h3>
  <pre>[전체]\n${(d.dumps.all || []).join('\n')}\n[입원]\n${(d.dumps.inp || []).join('\n')}\n[호텔]\n${(d.dumps.hot || []).join('\n')}</pre></details>`;
  $('#inF').textContent = inFound;
}
async function load() {
  $('#out').textContent = '인투링크에서 읽는 중… (10~20초)';
  DATA = await chrome.runtime.sendMessage({ t: 'collect' });
  render();
}
$('#real').onchange = render; $('#again').onclick = load; load();
