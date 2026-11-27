// 👀 연동 미리보기: 케어 노트로는 아무것도 보내지 않음. 이름은 기본으로 가림.
const $ = s => document.querySelector(s);
const nz = s => String(s || '').replace(/\s+/g, '').trim();
const mask = s => String(s || '').replace(/[가-힣]/g, '가').replace(/[A-Za-z]/g, 'a');
let DATA = null;
const E = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 외래로 등록하지 않고 퇴원 처리하는 접수 항목 (진료실·담당의·접수 내용 어디에 있어도)
const SKIP = /약\s*처방|전화\s*문의|수납\s*대기|면회/;
const skipOf = o => { const m = [o.room, o.vet, o.time, o.all].join(' ').match(SKIP); return m ? m[0].replace(/\s+/g, '') : ''; };
function show(v) { return $('#real').checked ? (v || '') : mask(v); }
function render() {
  const d = DATA; if (!d) return;
  const byKey = new Map(); d.pets.forEach(p => { const k = nz(p.owner) + '|' + nz(p.pet); if (!byKey.has(k)) byKey.set(k, p); });
  const byPet = new Map(); d.pets.forEach(p => { const k = nz(p.pet); byPet.set(k, byPet.has(k) ? null : p); });
  const findP = o => byKey.get(nz(o.owner) + '|' + nz(o.pet)) || (!o.owner ? byPet.get(nz(o.pet)) || null : null) || byKey.get(nz(o.pet) + '|' + nz(o.owner)) || null;
  // 이름 조금 달라도 (님, 괄호, 끝 숫자, 띄어쓰기) 맞춰 보기
  const nn = x => nz(x).replace(/\(.*?\)/g, '').replace(/님$/, '').replace(/\d+$/, '');
  const fuzzy = o => { const pe = nn(o.pet), ow = nn(o.owner); if (!pe) return null; const c = d.pets.filter(p => nn(p.pet) === pe && (!ow || !nn(p.owner) || nn(p.owner).includes(ow) || ow.includes(nn(p.owner)))); const u = [...new Set(c.map(p => p.psno))]; return u.length === 1 ? c[0] : null; };
  // 외래 줄(번호 아는 환축)로 '눌렀을 때 실행 코드'의 몇 번째 숫자가 동물번호인지 배우기
  const learn = {};
  d.opd.forEach(o => { const p = findP(o); if (!p || !o.cl) return; o.cl.calls.forEach(c => { const i = c.nums.indexOf(String(p.psno)); if (i >= 0) learn[c.fn] = i; }); });
  // 카드 글자 전체에 목록의 '고객명+동물명'이 둘 다 들어 있으면 그 환축 (카드 글자 모양이 달라도 찾음)
  const inCard = o => { const f = o.full || ''; if (!f) return null;
    let c = d.pets.filter(p => nz(p.owner).length >= 2 && nz(p.pet) && f.includes(nz(p.owner)) && f.includes(nz(p.pet)));
    if (!c.length) c = d.pets.filter(p => nz(p.pet).length >= 2 && f.includes(nz(p.pet)));
    const u = [...new Set(c.map(p => p.psno))]; return u.length === 1 ? { psno: u[0], how: '카드 글자' } : null; };
  const byNo = new Map(d.pets.map(p => [String(p.psno), p]));
  const inpNo = o => { const cl = o.cl || { calls: [], data: {} };
    if (cl.pno) return { psno: cl.pno, how: '칸 속 번호' };
    for (const c of cl.calls) if (learn[c.fn] != null && c.nums[learn[c.fn]]) return { psno: c.nums[learn[c.fn]], how: '차트 여는 코드' };
    for (const v of [...cl.calls.flatMap(c => c.nums), ...Object.values(cl.data)]) if (byNo.has(String(v))) return { psno: v, how: '목록과 일치' };
    const p = findP(o) || fuzzy(o) || inCard(o); return p ? { psno: p.psno, how: p.how || (p.via === 'search' ? '검색' : '이름') } : null; };
  const M0 = x => String(x || '').replace(/[가-힣]+/g, '가').replace(/\d/g, '0');
  const clueTxt = cl => cl ? [cl.pno ? '번호칸' : '', ...cl.calls.map(c => `${c.fn}(${c.nums.map(M0).join(',')})`), ...Object.keys(cl.data)].filter(Boolean).join(' ') || '단서 없음' : '-';
  const paid = new Set(d.paid.map(p => nz(p.owner) + '|' + nz(p.pet)));
  let found = 0, skipped = 0, inFound = 0;
  const rows = d.opd.map(o => { const k = nz(o.owner) + '|' + nz(o.pet), p = findP(o), sk = skipOf(o); if (p) found++; if (sk) skipped++;
    const act = sk ? `<b style="color:#b26a00">보류 (${sk}) · 외래 카드는 퇴원 목록으로 (지우지 않음)</b>` : paid.has(k) ? '✅ 수납완료 → 정리' : '외래 등록 (퇴원 목록에 있으면 복원)';
    return `<tr${sk ? ' style="background:#fff6e5"' : ''}><td>${show(o.owner)}</td><td>${show(o.pet)}</td><td>${o.time || ''}</td><td>${o.room || ''}</td><td>${p ? '#' + p.psno : '<b style="color:#c33">못 찾음</b>'}</td><td>${act}</td><td style="color:#888">${p ? p.st : ''}</td></tr>`; }).join('');
  $('#out').innerHTML = `
  <p>읽은 시각 ${new Date(d.at).toLocaleTimeString('ko-KR')} · 오늘 ${d.today} · 환축 목록 ${d.pages || 0}쪽(${d.until || ''}까지) + 이름 검색 ${d.searched || 0}번 · 번호 아는 환축 ${d.pets.length}마리 · 수납완료 ${d.paid.length}건(표 ${d.paidRaw ?? '?'}줄${d.paidHead && d.paidHead.length ? ', 예: ' + d.paidHead.join(' / ') : ''}) · 오늘 아닌 옛 대기 줄 ${d.opdOld || 0}개 (제외)</p>
  ${d.err.length ? `<p style="color:#c33">⚠ ${d.err.join(' / ')}</p>` : ''}
  <h3>외래대기 ${d.opd.length}마리 · 동물번호 찾음 ${found} · 보류(약처방·전화문의·수납대기·면회) ${skipped}</h3><p style="color:#666">인투벳에서 접수 취소돼 대기 목록에서 사라진 환축은 실제 연동(1.3)에서 케어 노트에서도 지워요.</p>
  <table><tr><th>고객명</th><th>동물명</th><th>접수일시</th><th>진료실</th><th>동물번호</th><th>케어 노트에서</th><th>상태 표시</th></tr>${rows}</table>
  <h3>입원·호텔 ${(d.inp || []).length}마리 · 동물번호 찾음 <span id="inF"></span> · 퇴원 안 눌린 옛 기록 ${(d.inpOld || []).length}개 (제외)</h3>
  <table><tr><th>구분</th><th>고객명</th><th>동물명</th><th>입원 일시</th><th>종</th><th>입원실</th><th>동물번호</th><th>케어 노트에서</th></tr>${(d.inp || []).map(o => { const p = inpNo(o); if (p) inFound++; return `<tr><td>${o.kind}</td><td>${show(o.owner)}</td><td>${show(o.pet)}</td><td>${o.dt || ''}</td><td>${o.sp || ''}</td><td>${show(o.room)}</td><td>${p ? '#' + p.psno + ` <small>(${p.how})</small>` : '<b style="color:#c33">못 찾음</b>'}</td><td>${o.kind} 카드로 등록·구분 맞춤</td></tr>`; }).join('')}</table>
  <details open><summary>🔎 이름 검색 진단 (동물번호 못 찾는 이유)</summary><pre>${E(`${(d.slog || []).map((x, i) => `검색 ${i + 1}: 결과 ${x.rows}줄 · 검색어 들어간 줄 ${x.hit}`).join('\n') || '검색 안 함'}\n\n${(d.form || []).join('\n')}`)}</pre></details>
  <details open><summary>🧭 인투링크 데이터 주소 찾기 (환자 정보 없음 · 주소 글자만)</summary><pre>${E(`${Object.entries(d.api || {}).map(([p, v]) => `[${p}]${v.err ? ' 실패: ' + v.err : ''}\n스크립트: ${(v.js || []).join(', ') || '-'}${(v.code || []).length ? '\n▶ 이 화면이 데이터 받는 코드:\n' + v.code.join('\n\n') + '\n' : ''}\n${(v.urls || []).map(u => ' ' + u).join('\n')}`).join('\n\n')}`)}</pre></details>
  <details open><summary>🧩 차트 번호 단서 (숫자는 0으로 가림)</summary><pre>${E(`배운 규칙: ${Object.entries(learn).map(([f, i]) => `${f} → ${i + 1}번째 숫자`).join(', ') || '없음'}\n[외래] ${d.opd.slice(0, 3).map(o => clueTxt(o.cl)).join('  /  ')}\n${(d.inp || []).map(o => `[${o.kind}] ${clueTxt(o.cl)}`).join('\n')}`)}</pre></details>
  <details><summary>입원·호텔 부분 모양 (가림)</summary><h3>입원·호텔 부분 모양 (가림)</h3>
  <pre>${E(`[전체]\n${(d.dumps.all || []).join('\n')}\n[입원]\n${(d.dumps.inp || []).join('\n')}\n[호텔]\n${(d.dumps.hot || []).join('\n')}`)}</pre></details>`;
  $('#inF').textContent = inFound;
}
async function load() {
  $('#out').textContent = '인투링크에서 읽는 중… (10~20초)';
  DATA = await chrome.runtime.sendMessage({ t: 'collect' });
  render();
}
async function np(path) { const o = $('#npo'); o.style.display = 'block'; o.textContent = '인투링크 화면을 잠깐 열어서 확인하는 중… (15초쯤, 새 탭이 잠깐 생겼다 닫혀요)'; try { o.textContent = await chrome.runtime.sendMessage({ t: 'netprobe', path }); } catch (e) { o.textContent = '실패: ' + e.message; } }
$('#np').onclick = () => np('/plus/receiptCompleted');
$('#real').onchange = render; $('#again').onclick = load; load();
