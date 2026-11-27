// 🔄 실제 연동: 3분마다 인투링크 진료대기·입원/호텔을 읽어 케어 노트(Firebase)에 반영.
// 인투링크에는 아무것도 쓰지 않음(읽기만). 케어 노트에는 동물번호·동물 이름·종·품종 정도만 저장(보호자 이름·전화 저장 안 함).
const RS = { KEY: 'AIzaSyB7SmDVueDq1ghmIbNTjcHGxMM2vpHSvWw', DB: 'https://songpabaro-default-rtdb.asia-southeast1.firebasedatabase.app', ROOM: 'songpa-baro-care', NAME: '접수실 인투링크 연동', tok: null, exp: 0, busy: false };
const rsGet = async k => (await chrome.storage.local.get(k))[k];
const rsSet = (k, v) => chrome.storage.local.set({ [k]: v });
async function rsLog(msg) { const l = (await rsGet('rsLog')) || []; if (l[0] && l[0].m === msg) { l[0].t = Date.now(); return rsSet('rsLog', l); } l.unshift({ t: Date.now(), m: msg }); await rsSet('rsLog', l.slice(0, 120)); }

// ---- 로그인 (케어 노트와 같은 기기 승인 방식: 익명 로그인 + 🔐 기기 관리에서 승인) ----
async function rsTok() {
  if (RS.tok && Date.now() < RS.exp) return RS.tok;
  let a = await rsGet('rsAuth'), r;
  if (a && a.rt) {
    r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${RS.KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(a.rt) });
    if (!r.ok) throw new Error('로그인 갱신 실패 ' + r.status);
    const j = await r.json(); a.rt = j.refresh_token; RS.tok = j.id_token; RS.exp = Date.now() + (+j.expires_in - 120) * 1000;
  } else {
    r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${RS.KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}' });
    if (!r.ok) throw new Error('로그인 실패 ' + r.status);
    const j = await r.json(); a = { uid: j.localId, rt: j.refreshToken }; RS.tok = j.idToken; RS.exp = Date.now() + (+j.expiresIn - 120) * 1000;
  }
  await rsSet('rsAuth', a);
  return RS.tok;
}
async function fb(method, path, body) {
  const r = await fetch(`${RS.DB}/${path}.json?auth=${await rsTok()}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${path.split('/').slice(-2).join('/')} ${r.status}`);
  return r.json();
}
async function rsDevice() {
  await rsTok(); const a = await rsGet('rsAuth'), code = a.uid.slice(-6).toUpperCase();
  const d = await fb('GET', `devices/${a.uid}`);
  if (!d || !d.name) await fb('PATCH', `devices/${a.uid}`, { name: RS.NAME, t: Date.now() });
  return { ok: !!(d && d.ok === true), code };
}

// ---- 한 번 연동 ----
const P = k => `rooms/${RS.ROOM}/${k}`;
const digits = s => String(s || '').replace(/\D/g, '');
const today = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`; };
const nowDT = () => { const n = new Date(); return `${today()} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; };
const hasRec = c => { const lg = c.logs; return !!((Array.isArray(lg) ? lg.length : lg && Object.keys(lg).length) || c.dx || c.memo || c.mjNo || (c.tasks && Object.keys(c.tasks).length) || (c.alerts && Object.keys(c.alerts).length) || c.anes); };
async function rsCollect(deep) {
  await bgRule(true); await ensureOff();
  return chrome.runtime.sendMessage({ t: 'collect', to: 'off', opt: { deep, diag: false } });
}
async function runSync(why) {
  if (RS.busy) return { skip: '이미 도는 중' }; RS.busy = true;
  const done = [];
  try {
    if (!(await rsGet('rsOn')) && why !== 'test') return { skip: '꺼짐' };
    const dv = await rsDevice();
    if (!dv.ok) { await rsSet('rsLast', { t: Date.now(), msg: `승인 대기 · 케어 노트 🔐 기기 관리에서 '${RS.NAME}' (코드 ${dv.code}) 승인 필요` }); return { wait: dv.code }; }
    // 케어 노트 ⚙ 설정의 연동 방식: 'LIS만'이면 인투링크를 읽지 않고 쉼 (휴대폰에서도 끄고 켤 수 있음)
    let mode = 'both';
    try { const cf = await fb('GET', P('config/sync')); if (cf && cf.mode === 'lis') mode = 'lis'; } catch (e) {}
    try { await fb('PATCH', P('config/sync'), { extSeen: { '.sv': 'timestamp' } }); } catch (e) {}
    if (mode === 'lis') { await rsSet('rsLast', { t: Date.now(), msg: '쉬는 중 · 케어 노트 설정이 "차트 읽기(LIS)만"이라 인투링크를 읽지 않아요' }); return { skip: 'LIS만' }; }
    const st = (await rsGet('rsState')) || {}; st.seen = st.seen || {}; st.cache = st.cache || {};
    const deep = !st.deepAt || Date.now() - st.deepAt > 30 * 60000;
    let d = await rsCollect(deep);
    if (d && (d.err || []).some(e => /로그인/.test(e))) throw new Error('인투링크 로그인이 풀렸어요 · 원장님이 접수실 크롬에서 다시 로그인하면 이어서 읽어요');
    if (!d || !d.items) throw new Error('인투링크 읽기 실패: ' + ((d && d.err || []).join(' / ') || '응답 없음'));
    if ((d.err || []).some(e => /로그인|진료대기 읽기/.test(e))) throw new Error(d.err.join(' / '));
    if (deep) st.deepAt = Date.now();
    // 입원·호텔: 이번에 번호를 못 찾았으면 전에 찾은 번호(카드 글자 기준) 사용
    d.items.forEach(it => { if (it.kind !== '외래' && it.full) { if (it.psno) st.cache[it.kind + '|' + it.full] = it.psno; else if (st.cache[it.kind + '|' + it.full]) it.psno = st.cache[it.kind + '|' + it.full]; } });
    const care = (await fb('GET', P('care_patients'))) || {}, dis = (await fb('GET', P('discharged_patients'))) || {};
    const cBy = {}, dBy = {};
    Object.values(care).forEach(c => { if (c && c.id && digits(c.chartNo)) cBy[digits(c.chartNo)] = c; });
    Object.values(dis).forEach(c => { if (c && c.id && digits(c.chartNo)) { const k = digits(c.chartNo); if (!dBy[k] || (c.dischargedTs || 0) > (dBy[k].dischargedTs || 0)) dBy[k] = c; } });
    const now = Date.now(), td = today();
    const toDis = async (c, why2) => { const x = { ...c, dischargedAt: nowDT(), dischargedTs: now, autoOut: why2, syncOut: 'intolink' }; await fb('PUT', P(`discharged_patients/${c.id}`), x); await fb('DELETE', P(`care_patients/${c.id}`)); delete cBy[digits(c.chartNo)]; dBy[digits(c.chartNo)] = x; };
    const back = async (x, cat) => { const c = { ...x, category: cat, catBy: 'intolink', catAt: now }; delete c.dischargedAt; delete c.dischargedTs; delete c.autoOut; delete c.syncOut; await fb('PUT', P(`care_patients/${c.id}`), c); await fb('DELETE', P(`discharged_patients/${x.id}`)); delete dBy[digits(x.chartNo)]; cBy[digits(x.chartNo)] = c; };
    const add = async (it, cat) => {
      const info = await chrome.runtime.sendMessage({ t: 'petinfo', to: 'off', q: { psno: it.psno, csno: it.csno, hidx: it.hidx } }).catch(() => ({}));
      const sp = it.sp ? (/Feline/i.test(it.sp) ? 'cat' : 'dog') : (info && info.sp) || 'dog';
      const id = 'p-care-' + now + '-' + it.psno;
      const c = { id, name: (info && info.name) || it.pet || '#' + it.psno, room: cat === '외래' ? '' : (it.room || ''), chartNo: it.psno, species: sp, breed: (info && info.breed) || '', owner: '', dx: '', category: cat, adm: td, auto: 'intolink', sex: (info && info.sex) || '', bw: (info && info.bw) || '', birth: (info && info.birth) || '' };
      await fb('PUT', P(`care_patients/${id}`), c); cBy[it.psno] = c; return c;
    };
    const nowOpd = new Set(), nowInp = new Set();
    for (const it of d.items) {
      if (!it.psno) continue;
      if (it.kind === '외래') {
        nowOpd.add(it.psno); st.seen[it.psno] = { t: now, d: td, hold: it.hold || '' };
        const c = cBy[it.psno], x = dBy[it.psno];
        if (it.hold) { if (c && (c.category || '외래') === '외래') { await toDis(c, `보류(${it.hold})`); done.push(`⏸ 보류(${it.hold}) → 퇴원 목록 · ${c.name} #${it.psno}`); } continue; }
        if (c) continue;
        if (x && x.syncOut === 'intolink' && /^보류/.test(x.autoOut || '')) { await back(x, '외래'); done.push(`↩ 다시 외래 → 복원 · ${x.name} #${it.psno}`); continue; }
        if (x && (x.dischargedTs || 0) > now - 12 * 3600000) continue;   // 오늘 사람이 퇴원시킨 카드는 되살리지 않음
        const n = await add(it, '외래'); done.push(`✅ 외래 등록 · ${n.name} #${it.psno}`);
      } else {
        nowInp.add(it.psno); const c = cBy[it.psno], x = dBy[it.psno];
        if (c) { if (c.category !== it.kind && c.catBy !== 'manual') { await fb('PATCH', P(`care_patients/${c.id}`), { category: it.kind, catBy: 'intolink', catAt: now }); done.push(`🏥 ${it.kind}(으)로 바꿈 · ${c.name} #${it.psno}`); } continue; }
        if (x && x.syncOut !== 'intolink' && (x.dischargedTs || 0) > now - 12 * 3600000) continue;   // 사람이 방금 퇴원시킨 카드는 그대로 둠
        if (x) { await back(x, it.kind); done.push(`↩ ${it.kind} → 복원 · ${x.name} #${it.psno}`); continue; }
        const n = await add(it, it.kind); done.push(`✅ ${it.kind} 등록 · ${n.name} #${it.psno}`);
      }
    }
    // 외래 대기에서 빠진 환축: 입원·호텔로 갔으면 위에서 처리됨. 그 밖엔 접수 취소 → 기록 없으면 지우고, 기록·오더 있으면 퇴원 목록으로
    const gone = Object.keys(st.seen).filter(k => st.seen[k].d === td && !nowOpd.has(k) && !nowInp.has(k));
    // 전에 자동 등록돼 쌓여 있던 외래 카드도: 지금 인투링크 외래 대기·입원·호텔 어디에도 없으면 같은 규칙으로 정리
    Object.values(cBy).forEach(c => { const k = digits(c.chartNo); if ((c.category || '외래') === '외래' && (c.auto === 'intolink' || c.auto === 'intovet') && !nowOpd.has(k) && !nowInp.has(k) && !gone.includes(k)) gone.push(k); });
    if (gone.length && d.items.some(i => i.kind !== '외래' && !i.psno)) done.push(`⏳ 입원·호텔 중 번호 못 찾은 환축이 있어 외래 정리는 다음 차례로 미룸`);
    else if (gone.length > 3 && !nowOpd.size) done.push(`⚠ 인투링크 외래 대기가 비어 보여 이번엔 정리 안 함 (읽기 오류일 수 있음 · 정리 대상 ${gone.length}마리)`);
    else if (gone.length) {
      const ords = (await fb('GET', P('orders'))) || {};
      for (const k of gone) {
        const c = cBy[k], x = dBy[k], card = c || x;
        const hasOrd = card && Object.values(ords).some(o => o && (o.pid === card.id || digits(o.chart) === k));
        if (c && (c.category || '외래') === '외래' && (c.auto === 'intolink' || c.auto === 'intovet')) {
          if (!hasRec(c) && !hasOrd) { await fb('DELETE', P(`care_patients/${c.id}`)); delete cBy[k]; done.push(`🗑 접수 취소(대기에서 빠짐) · 기록 없어 지움 · ${c.name} #${k}`); }
          else { await toDis(c, '대기에서 빠짐'); done.push(`📤 대기에서 빠짐 · 기록 있어 퇴원 목록으로 · ${c.name} #${k}`); }
        } else if (!c && x && x.syncOut === 'intolink' && /^보류/.test(x.autoOut || '') && !hasRec(x) && !hasOrd) {
          await fb('DELETE', P(`discharged_patients/${x.id}`)); done.push(`🗑 보류 환축 접수 취소 · 퇴원 목록에서도 지움 · ${x.name} #${k}`);
        }
        delete st.seen[k];
      }
    }
    Object.keys(st.seen).forEach(k => { if (st.seen[k].d !== td) delete st.seen[k]; });
    const ck = Object.keys(st.cache); if (ck.length > 80) ck.slice(0, ck.length - 80).forEach(k => delete st.cache[k]);
    await rsSet('rsState', st);
    for (const m of done.reverse()) await rsLog(m);
    const miss = d.items.filter(i => !i.psno).length;
    await rsSet('rsLast', { t: Date.now(), msg: `정상 · 외래 ${nowOpd.size} · 입원·호텔 ${nowInp.size}${miss ? ` · 번호 못 찾음 ${miss}` : ''}${done.length ? ` · 바뀐 것 ${done.length}` : ''}${deep ? ' · (깊게 읽음)' : ''}` });
    return { ok: true, n: done.length };
  } catch (e) {
    await rsSet('rsLast', { t: Date.now(), msg: '⚠ ' + e.message, err: true });
    await rsLog('⚠ ' + e.message);
    return { err: e.message };
  } finally { RS.busy = false; }
}
// 읽는 간격: 고정 3분 (숨기려는 의도 없이 일정하게)
const rsNextMin = () => 3;
async function rsArm(first) { const on = await rsGet('rsOn'); await chrome.alarms.clear('sbsync'); if (on) chrome.alarms.create('sbsync', { delayInMinutes: first ? 0.2 : rsNextMin() }); }
chrome.alarms.onAlarm.addListener(async a => { if (a.name !== 'sbsync') return; try { await runSync('alarm'); } finally { await rsArm(false); } });
// 서비스 워커가 깨어났는데 예약이 없으면 다시 예약 (크롬 재시작·업데이트 대비)
chrome.alarms.get('sbsync').then(x => { if (!x) rsArm(true); });
chrome.runtime.onStartup.addListener(() => rsArm(true)); chrome.runtime.onInstalled.addListener(() => rsArm(true));
chrome.runtime.onMessage.addListener((m, s, send) => {
  if (m.t === 'rs-status') { (async () => { let code = ''; try { const a = await rsGet('rsAuth'); code = a ? a.uid.slice(-6).toUpperCase() : ''; } catch (e) {}
    send({ on: !!(await rsGet('rsOn')), code, last: await rsGet('rsLast'), log: ((await rsGet('rsLog')) || []).slice(0, 40) }); })(); return true; }
  if (m.t === 'rs-toggle') { (async () => { const on = !(await rsGet('rsOn')); await rsSet('rsOn', on); await rsLog(on ? '🔄 실제 연동 켬' : '⏹ 실제 연동 끔'); await rsArm(true); send({ on }); })(); return true; }
  if (m.t === 'rs-run') { runSync('manual').then(send); return true; }
});
