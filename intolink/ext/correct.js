// 🔄 인투링크로 맞추기: 케어 노트에서 누가 버튼을 누를 때만(15분에 한 번까지) 진료대기 페이지를 '한 번' 받아
// 케어 노트 카드를 인투링크 명단 기준으로 정리. 자동으로 반복해서 읽지 않음. 인투링크에는 아무것도 쓰지 않음.
const IL = { busy: false, devAt: 0, devOk: false };
function ilArm() { chrome.alarms.get('ilpoll').then(x => { if (!x) chrome.alarms.create('ilpoll', { periodInMinutes: 0.5 }); }); }
ilArm(); chrome.runtime.onStartup.addListener(ilArm); chrome.runtime.onInstalled.addListener(ilArm);
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'ilpoll') ilPoll(); });
async function ilPoll() {
  if (IL.busy) return; IL.busy = true;
  try {
    if (!IL.devOk || Date.now() - IL.devAt > 10 * 60000) { const dv = await rsDevice(); IL.devOk = dv.ok; IL.devAt = Date.now(); if (!dv.ok) return; }
    const req = await fb('GET', P('ilreq'));   // 케어 노트의 요청 (읽기만 · 다른 기기로 퍼지지 않음)
    if (!req || !req.id || !req.t) return;
    if (req.id === ((await rsGet('ilDone')) || '')) return;
    await rsSet('ilDone', req.id);
    if (Date.now() - req.t > 10 * 60000) return;              // 오래된 요청은 무시
    if (!(await ilClaim(req.id))) return;                       // 확장이 여러 PC에 있어도 한 대만
    await ilRun(req);
  } catch (e) { try { await rsLog('⚠ 맞추기: ' + e.message); } catch (x) {} }
  finally { IL.busy = false; }
}
async function ilClaim(id) {
  const u = `${RS.DB}/${P('ilclaim')}.json?auth=${await rsTok()}`;
  const g = await fetch(u, { headers: { 'X-Firebase-ETag': 'true' }, cache: 'no-store' }); const et = g.headers.get('ETag');
  let v = null; try { v = await g.json(); } catch (e) {}
  if (v && v.id === id) return false;
  const h = { 'Content-Type': 'application/json' }; if (et) h['if-match'] = et;
  const w = await fetch(u, { method: 'PUT', headers: h, body: JSON.stringify({ id, t: Date.now() }) });
  return w.ok;
}
async function ilRun(req) {
  const now = Date.now(), td = today();
  const res = { t: now, id: req.id, by: req.by || '', apply: false, lines: [], unknown: [], err: '', n: {} };
  const put = async () => { res.lines = res.lines.slice(0, 120); res.unknown = res.unknown.slice(0, 60); await fb('PUT', P('ilres'), res); await rsLog(`🔄 맞추기 (${res.by}) · ${res.err || (res.apply ? '반영 ' : '미리보기 ') + res.lines.length + '건'}`); };
  const GAP = 15 * 60000, last = (await rsGet('ilLast')) || 0, snap = await rsGet('ilSnap');
  // 미리보기 뒤 10분 안에 '이대로 반영'을 누르면 진료대기를 다시 받지 않고 그 미리보기 결과로 반영 (인투링크 요청 추가 없음)
  const reuse = req.apply && req.from && snap && snap.id === req.from && now - snap.t < 10 * 60000;
  if (!reuse && now - last < GAP) { res.err = `인투링크 맞추기는 15분에 한 번까지예요 · ${Math.ceil((GAP - (now - last)) / 60000)}분 뒤에 다시 눌러 주세요`; res.nextAt = last + GAP; return put(); }
  if (!reuse) await rsSet('ilLast', now);
  res.nextAt = (reuse ? last : now) + GAP;
  const cfg = (await fb('GET', P('config/sync'))) || {};
  res.apply = !!(req.apply || cfg.ilApply);
  const care = (await fb('GET', P('care_patients'))) || {}, dis = (await fb('GET', P('discharged_patients'))) || {};
  const cards = Object.values(care).filter(c => c && c.id), cBy = {}, dBy = {};
  cards.forEach(c => { const k = digits(c.chartNo); if (k) cBy[k] = c; });
  Object.values(dis).forEach(c => { if (!c || !c.id) return; const k = digits(c.chartNo); if (k && (!dBy[k] || (c.dischargedTs || 0) > (dBy[k].dischargedTs || 0))) dBy[k] = c; });
  const pets = [...Object.keys(cBy).map(k => ({ psno: k, pet: cBy[k].name })), ...Object.keys(dBy).filter(k => !cBy[k]).map(k => ({ psno: k, pet: dBy[k].name }))];
  let d;
  if (reuse) { d = snap.d; res.reused = true; }
  else {
    await bgRule(true); await ensureOff();
    d = await chrome.runtime.sendMessage({ t: 'collectWait', to: 'off', q: { pets, learn: (await rsGet('ilLearn')) || {} } });
    if (!d || (d.err && d.err.length)) { res.err = ((d && d.err) || ['응답 없음']).join(' / '); return put(); }
    await rsSet('ilLearn', d.learn || {});
    await rsSet('ilSnap', { id: req.id, t: now, d: { items: d.items, unknown: d.unknown, nOpd: d.nOpd, nInp: d.nInp } });
  }
  res.n = { opd: d.nOpd, inp: d.nInp, unknown: d.unknown.length };
  res.unknown = d.unknown.map(u => `${u.kind} · ${u.pet || '(이름 없음)'}`);
  if (!d.items.length && !d.unknown.length && cards.length >= 3) { res.err = '인투링크 진료대기가 비어 보여요 · 읽기 오류일 수 있어 아무것도 바꾸지 않았어요'; return put(); }
  const ords = (await fb('GET', P('orders'))) || {};
  const hasOrd = c => Object.values(ords).some(o => o && (o.pid === c.id || (digits(o.chart) && digits(o.chart) === digits(c.chartNo))));
  const A = [];   // 할 일 [설명, 실행]
  const nm = c => `${c.name || ''} #${digits(c.chartNo)}`;
  const toDis = (c, why) => async () => { const x = { ...c, dischargedAt: nowDT(), dischargedTs: Date.now(), autoOut: why, syncOut: 'ilfix' }; await fb('PUT', P(`discharged_patients/${c.id}`), x); await fb('DELETE', P(`care_patients/${c.id}`)); };
  const trashDel = (c, why) => async () => { await fb('POST', P('trash'), { t: Date.now(), by: '인투링크 맞추기', kind: 'patient', label: `${c.name || '#' + digits(c.chartNo)} (${why})`.slice(0, 120), data: { room: 'care', p: c } }); await fb('DELETE', P(`care_patients/${c.id}`)); };
  const back = (x, cat) => async () => { const c = { ...x, category: cat, catBy: 'intolink', catAt: Date.now() }; ['dischargedAt', 'dischargedTs', 'autoOut', 'syncOut'].forEach(k => delete c[k]); await fb('PUT', P(`care_patients/${c.id}`), c); await fb('DELETE', P(`discharged_patients/${x.id}`)); };
  const add = (it, cat) => async () => { const id = 'p-care-' + Date.now() + '-' + it.psno; await fb('PUT', P(`care_patients/${id}`), { id, name: it.pet || '#' + it.psno, room: cat === '외래' ? '' : it.room || '', chartNo: it.psno, species: /Feline/i.test(it.sp) ? 'cat' : 'dog', spUnk: !it.sp, breed: '', owner: '', dx: '', category: cat, adm: td, auto: 'ilfix' }); };
  const seen = new Set(), inpSeen = new Set();
  for (const it of d.items) {
    const k = it.psno, c = cBy[k], x = dBy[k]; seen.add(k); if (it.kind !== '외래') inpSeen.add(k);
    const recentByHand = x && x.syncOut !== 'ilfix' && x.syncOut !== 'intolink' && (x.dischargedTs || 0) > now - 12 * 3600000;
    if (it.kind === '외래') {
      if (it.hold) { if (c && (c.category || '외래') === '외래' && c.auto) A.push([`⏸ 보류(${it.hold}) → 퇴원 목록 · ${nm(c)}`, toDis(c, `보류(${it.hold})`)]); continue; }
      if (c) continue;
      if (recentByHand) { res.lines.push(`✋ 그대로 둠 · ${it.pet} #${k} · 오늘 직접 퇴원시킨 카드`); continue; }
      A.push([`✅ 새로 등록 · 외래 · ${it.pet} #${k}`, add(it, '외래')]);
    } else {
      if (c) {
        if ((c.category || '외래') !== it.kind) { if (c.catBy === 'manual') res.lines.push(`✋ 그대로 둠 · ${nm(c)} · 직접 '${c.category || '외래'}'로 바꾼 카드 (인투링크는 ${it.kind})`);
          else A.push([`🏥 ${nm(c)} · ${c.category || '외래'} → ${it.kind}`, async () => fb('PATCH', P(`care_patients/${c.id}`), { category: it.kind, catBy: 'intolink', catAt: Date.now() })]); }
        continue; }
      if (recentByHand) { res.lines.push(`✋ 그대로 둠 · ${it.pet} #${k} · 오늘 직접 퇴원시킨 카드`); continue; }
      if (x) { A.push([`↩ 퇴원 목록에서 되돌림 · ${it.kind} · ${nm(x)}`, back(x, it.kind)]); continue; }
      A.push([`✅ 새로 등록 · ${it.kind} · ${it.pet} #${k}`, add(it, it.kind)]);
    }
  }
  // 인투링크 명단에 없는 케어 노트 카드
  const inpCards = cards.filter(c => (c.category || '외래') !== '외래').length;
  const inpGuard = !d.nInp && inpCards >= 2;
  if (inpGuard) res.lines.push(`⚠ 인투링크 입원·호텔이 0으로 보여서 입원·호텔 퇴원 처리는 하지 않았어요 (읽기 오류일 수 있음)`);
  for (const c of cards) {
    const k = digits(c.chartNo); if (!k) continue; if (seen.has(k)) continue;
    const cat = c.category || '외래';
    if (cat === '외래') {
      if (!c.auto) { res.lines.push(`✋ 그대로 둠 · 직접 등록한 외래 · ${nm(c)}`); continue; }
      if (!hasRec(c) && !hasOrd(c)) A.push([`🗑 정리 · 외래 · ${nm(c)} (명단에 없음 · 기록 없음 · 최근 지운 항목에 보관)`, trashDel(c, '인투링크 명단에 없음')]);
      else A.push([`📤 퇴원 목록으로 · 외래 · ${nm(c)} (명단에 없음 · 기록 있음)`, toDis(c, '인투링크 명단에 없음')]);
    } else if (!inpGuard) A.push([`📤 퇴원 처리 · ${cat} · ${nm(c)} (인투링크 ${cat} 명단에 없음)`, toDis(c, `인투링크 ${cat} 명단에 없음`)]);
  }
  const noNo = cards.filter(c => !digits(c.chartNo)).length;
  if (noNo) res.lines.push(`ℹ 동물번호가 없는 카드 ${noNo}개는 비교하지 못했어요`);
  if (res.apply) { const done = []; for (const [t, f] of A) { try { await f(); done.push(t); } catch (e) { done.push('⚠ 실패 · ' + t + ' · ' + e.message); } } res.lines = [...done, ...res.lines]; }
  else res.lines.unshift(...A.map(a => a[0]));
  res.nAct = A.length;
  return put();
}
