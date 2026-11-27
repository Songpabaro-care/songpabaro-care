// 👀 연동 미리보기: 케어 노트로는 아무것도 보내지 않음. 이름은 기본으로 가림.
const $ = s => document.querySelector(s);
const nz = s => String(s || '').replace(/\s+/g, '').trim();
const mask = s => String(s || '').replace(/[가-힣]/g, '가').replace(/[A-Za-z]/g, 'a');
let DATA = null;
const E = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// 외래로 등록하지 않고 퇴원 처리하는 접수 항목 (진료실·담당의·접수 내용 어디에 있어도)
const skipOf = sbSkipOf;
function show(v) { return $('#real').checked ? (v || '') : mask(v); }
function render() {
  const d = DATA; if (!d) return;
  const MT = sbMatch(d), findP = MT.findP, inpNo = MT.inpNo;
  let found = 0, skipped = 0, inFound = 0;
  const rows = d.opd.map(o => { const k = nz(o.owner) + '|' + nz(o.pet), p = findP(o), sk = skipOf(o); if (p) found++; if (sk) skipped++;
    const act = sk ? `<b style="color:#b26a00">보류 (${sk}) · 외래 카드는 퇴원 목록으로 (지우지 않음)</b>`   : '외래 등록 (퇴원 목록에 있으면 복원)';
    return `<tr${sk ? ' style="background:#fff6e5"' : ''}><td>${show(o.owner)}</td><td>${show(o.pet)}</td><td>${o.time || ''}</td><td>${o.room || ''}</td><td>${p ? '#' + p.psno : '<b style="color:#c33">못 찾음</b>'}</td><td>${act}</td><td style="color:#888;font-size:12px">${E(o.cls || '-')}</td></tr>`; }).join('');
  $('#out').innerHTML = `
  <p>읽은 시각 ${new Date(d.at).toLocaleTimeString('ko-KR')} · 오늘 ${d.today} · 환축 목록 ${d.pages || 0}쪽(${d.until || ''}까지) · 번호 아는 환축 ${d.pets.length}마리 · 오늘 아닌 옛 대기 줄 ${d.opdOld || 0}개 (제외)</p>
  ${d.err.length ? `<p style="color:#c33">⚠ ${d.err.join(' / ')}</p>` : ''}
  <h3>외래대기 ${d.opd.length}마리 · 동물번호 찾음 ${found} · 보류(약처방·전화문의·수납대기·면회) ${skipped}</h3><p style="color:#666">외래 대기에서 빠진 환축: 입원·호텔로 갔으면 구분만 바꾸고, 아니면 접수 취소로 보고 기록·오더가 없으면 지우고 있으면 퇴원 목록으로 옮겨요 (위 🔄 실제 연동이 켜져 있을 때).</p>
  <table><tr><th>고객명</th><th>동물명</th><th>접수일시</th><th>진료실</th><th>동물번호</th><th>케어 노트에서</th><th>줄 표시 (상태 색)</th></tr>${rows}</table>
  <h3>입원·호텔 ${(d.inp || []).length}마리 · 동물번호 찾음 <span id="inF"></span> · 퇴원 안 눌린 옛 기록 ${(d.inpOld || []).length}개 (제외)</h3>
  <table><tr><th>구분</th><th>고객명</th><th>동물명</th><th>입원 일시</th><th>종</th><th>입원실</th><th>동물번호</th><th>케어 노트에서</th></tr>${(d.inp || []).map(o => { const p = inpNo(o); if (p) inFound++; return `<tr><td>${o.kind}</td><td>${show(o.owner)}</td><td>${show(o.pet)}</td><td>${o.dt || ''}</td><td>${o.sp || ''}</td><td>${show(o.room)}</td><td>${p ? '#' + p.psno + ` <small>(${p.how})</small>` : '<b style="color:#c33">못 찾음</b>'}</td><td>${o.kind} 카드로 등록·구분 맞춤</td></tr>`; }).join('')}</table>
  `;
  $('#inF').textContent = inFound;
}
async function load() {
  $('#out').textContent = '인투링크에서 읽는 중… (10~20초)';
  DATA = await chrome.runtime.sendMessage({ t: 'collect' });
  render();
}
// 🔄 실제 연동 상태·켜고 끄기·기록
async function rsRender() {
  let s; try { s = await chrome.runtime.sendMessage({ t: 'rs-status' }); } catch (e) { return; }
  const tm = t => t ? new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '';
  const hide = m => $('#real').checked ? m : String(m).replace(/ · ([^#·]+?) #(\d+)/g, (a, n, k) => ' · ' + mask(n) + ' #' + k);
  $('#rs').innerHTML = `<b style="font-size:15px">🔄 실제 연동 ${s.on ? '<span style="color:#1a7f37">켜짐 (2~3분마다)</span>' : '<span style="color:#888">꺼짐</span>'}</b>
   <button id="rsT" style="margin-left:8px">${s.on ? '⏹ 끄기' : '▶ 켜기'}</button> ${s.on ? '<button id="rsR">지금 한 번</button>' : ''}
   <div style="margin-top:4px;color:#555">${s.last ? `마지막 ${tm(s.last.t)} · ${E(s.last.msg)}` : '아직 안 돌았어요'}${s.code ? ` · 이 확장의 기기 코드 <b>${E(s.code)}</b>` : ''}</div>
   <div style="color:#666;font-size:12px;margin-top:2px">켜면 이 PC 크롬이 2~3분마다 인투링크를 읽어 케어 노트에 외래 등록·입원/호텔 구분·보류·접수 취소 정리를 해요. 인투링크에는 아무것도 쓰지 않아요. 처음 켜면 케어 노트 🔐 기기 관리에서 '접수실 인투링크 연동'을 승인해 주세요.</div>
   ${s.log && s.log.length ? `<details ${s.on ? 'open' : ''} style="margin-top:6px"><summary>최근 기록</summary><pre style="max-height:220px;overflow:auto">${E(s.log.map(l => tm(l.t) + '  ' + hide(l.m)).join('\n'))}</pre></details>` : ''}`;
  $('#rsT').onclick = async () => { await chrome.runtime.sendMessage({ t: 'rs-toggle' }); setTimeout(rsRender, 1500); };
  const r = $('#rsR'); if (r) r.onclick = async () => { r.disabled = true; r.textContent = '도는 중…'; await chrome.runtime.sendMessage({ t: 'rs-run' }); rsRender(); };
}
rsRender(); setInterval(rsRender, 20000);
$('#real').onchange = () => { render(); rsRender(); }; $('#again').onclick = load; load();
