const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';
const KEEP = ['입원호텔', '진료완료', '수납대기', '접수대기', '진료대기', '대기', '입원', '호텔', '접수', '수납', '수납완료', '완료', '진료중', '진료', '외래', '퇴원', '미수', '보호자', '고객', '고객명', '동물', '동물명', '환자', '이름', '번호', '차트', '상태', '시간', '오늘', '전체', '검색', '종', '품종', '체중', '나이', '성별', '담당', '수의사', '방', '룸', '입원실', '호텔실', '메모', '예약', '대기자', '목록', 'Canine', 'Feline', '중성화', '수컷', '암컷'];
// 글자 모양만 남기고 가리기: 한글 → 가, 숫자 → 0, 영문 → a (아는 화면 낱말은 그대로)
function mask(s) {
  return String(s).replace(/\s+/g, ' ').trim().split(' ').map(w => {
    const core = w.replace(/[()\[\]:,.\/·-]/g, '');
    if (KEEP.includes(core)) return w;
    return w.replace(/[가-힣]/g, '가').replace(/[0-9]/g, '0').replace(/[A-Za-z]/g, 'a');
  }).join(' ').slice(0, 80);
}
function shape(v, d) {
  if (d > 5) return '…';
  if (Array.isArray(v)) return v.length ? `[${v.length}개] ` + shape(v[0], d + 1) : '[]';
  if (v && typeof v === 'object') return '{' + Object.keys(v).slice(0, 40).map(k => k + ':' + shape(v[k], d + 1)).join(', ') + '}';
  if (typeof v === 'string') return '"' + mask(v).slice(0, 20) + '"';
  return typeof v;
}
async function uaRule(tabIds) {
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1], addRules: [{
    id: 1, priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [
      { header: 'user-agent', operation: 'set', value: UA },
      { header: 'sec-ch-ua-mobile', operation: 'set', value: '?1' },
      { header: 'sec-ch-ua-platform', operation: 'set', value: '"Android"' }] },
    condition: { requestDomains: ['intolink.co.kr'], tabIds } }] });
}
chrome.runtime.onMessage.addListener(m => { if (m.t === 'diag') diag(); });
async function dbg(tgt, m, p) { return chrome.debugger.sendCommand(tgt, m, p || {}); }
// 개발자 도구 '폰 화면 모드'와 같은 방식
async function mobileTab(tabId) {
  const tgt = { tabId };
  await chrome.debugger.attach(tgt, '1.3');
  await dbg(tgt, 'Network.enable');
  await dbg(tgt, 'Page.enable');
  await dbg(tgt, 'Emulation.setUserAgentOverride', { userAgent: UA, platform: 'Linux armv8l', acceptLanguage: 'ko-KR',
    userAgentMetadata: { brands: [{ brand: 'Chromium', version: '121' }, { brand: 'Samsung Internet', version: '25' }], fullVersion: '121.0.0.0',
      platform: 'Android', platformVersion: '14.0.0', architecture: '', model: 'SM-A556N', mobile: true } });
  await dbg(tgt, 'Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await dbg(tgt, 'Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2.6, mobile: true });
  return tgt;
}
async function diag() {
  const out = ['== 인투링크 진단 0.4 ' + new Date().toLocaleString('ko-KR') + ' =='];
  const tab = await chrome.tabs.create({ url: 'about:blank', active: true });
  let tgt;
  try { tgt = await mobileTab(tab.id); } catch (e) { out.push('폰 모드 켜기 실패: ' + e.message); }
  const res = [];
  const on = (src, m, p) => {
    if (!tgt || src.tabId !== tab.id) return;
    if (m === 'Network.responseReceived' && /intolink/.test(p.response.url) && !['Image', 'Font', 'Stylesheet', 'Media'].includes(p.type))
      res.push({ id: p.requestId, url: p.response.url, ty: p.type, st: p.response.status, mt: p.response.mimeType });
  };
  chrome.debugger.onEvent.addListener(on);
  try { if (tgt) await dbg(tgt, 'Page.navigate', { url: 'https://intolink.co.kr/plus/waitList' }); else await chrome.tabs.update(tab.id, { url: 'https://intolink.co.kr/plus/waitList' }); } catch (e) { out.push('열기 실패: ' + e.message); }
  await new Promise(r => setTimeout(r, 10000));
  // 화면 뒤 데이터 (Vue) · 페이지 안 스크립트 변수: 칸 이름과 값 모양만
  let vue = null;
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func: () => {
      const KEYS = 60;
      const sh = (v, d) => {
        if (d > 4) return '…';
        if (Array.isArray(v)) return v.length ? `[${v.length}개] ` + sh(v[0], d + 1) : '[]';
        if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => !k.startsWith('_') && !k.startsWith('$')).slice(0, KEYS).map(k => k + ':' + sh(v[k], d + 1)).join(', ') + '}';
        if (typeof v === 'string') return '"' + v.replace(/[가-힣]/g, '가').replace(/[0-9]/g, '0').replace(/[A-Za-z]/g, 'a').slice(0, 16) + '"';
        return typeof v;
      };
      const out = [];
      const seen = new Set();
      for (const el of document.querySelectorAll('*')) {
        const vm = el.__vue__;
        if (vm && !seen.has(vm)) { seen.add(vm); try { const d = vm.$data || {}; if (Object.keys(d).length) out.push('Vue2 ' + (el.id ? '#' + el.id : el.tagName.toLowerCase()) + ' → ' + sh(d, 0).slice(0, 1500)); } catch (e) {} }
        const app = el.__vue_app__;
        if (app && !seen.has(app)) { seen.add(app); try { const inst = app._instance; const d = inst && (inst.data || inst.setupState) || {}; out.push('Vue3 ' + (el.id ? '#' + el.id : el.tagName.toLowerCase()) + ' → ' + sh(Object.assign({}, inst.data || {}, inst.setupState || {}), 0).slice(0, 1500)); } catch (e) {} }
        if (out.length > 6) break;
      }
      // 페이지 안 스크립트의 변수 이름
      const vars = [];
      for (const s of document.querySelectorAll('script:not([src])')) {
        const t = s.textContent;
        for (const m of t.matchAll(/(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*([\[{'"])/g)) vars.push(m[1] + (m[2] === '[' ? '=[…]' : m[2] === '{' ? '={…}' : '=글자'));
      }
      // 표 첫 줄에 붙은 클릭 동작 이름
      const tr = document.querySelector('#waitListTable tbody tr');
      let click = '';
      if (tr) { const vm = tr.__vue__ || (tr.closest('[id]') || {}).__vue__; click = [...tr.attributes].map(a => a.name).join(',') + (tr.__vnode ? ' (vnode)' : '') + (vm ? ' vm' : ''); }
      return { out, vars: [...new Set(vars)].slice(0, 40), click, inlineLen: [...document.querySelectorAll('script:not([src])')].map(s => s.textContent.length) };
    } });
    vue = r.result;
  } catch (e) { out.push('화면 뒤 데이터 읽기 실패: ' + e.message); }
  let page = null;
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
      const lines = []; const seen = new Set();
      const walk = (el, depth) => {
        if (lines.length > 160 || depth > 25) return;
        for (const c of el.children) {
          if (['SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT'].includes(c.tagName)) continue;
          const own = [...c.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join(' ').trim();
          if (own) { const tag = c.tagName.toLowerCase() + (c.className && typeof c.className === 'string' ? '.' + c.className.trim().split(/\s+/).slice(0, 2).join('.') : ''); const k = tag + '|' + own; if (!seen.has(k)) { seen.add(k); lines.push([depth, tag, own]); } }
          walk(c, depth + 1);
        }
      };
      walk(document.body, 0);
      // 표: 칸 제목(화면 낱말), 줄 수, 첫 두 줄의 칸 구조와 속성 이름
      const tables = [...document.querySelectorAll('table')].map(t => {
        const ths = [...t.querySelectorAll('thead th, tr:first-child th')].map(x => x.textContent.trim().slice(0, 15));
        const rows = [...t.querySelectorAll('tbody tr')];
        const sample = rows.slice(0, 2).map(tr => ({
          attrs: [...tr.attributes].map(a => [a.name, a.value]),
          tds: [...tr.children].map(td => ({ t: td.textContent.trim(), a: [...td.querySelectorAll('[onclick],[href],[data-idx],[data-id]')].slice(0, 2).map(e => [...e.attributes].filter(x => x.name !== 'class' && x.name !== 'style').map(x => [x.name, x.value])) }))
        }));
        const box = t.closest('[id],[class]');
        return { cls: t.className, box: box ? (box.id ? '#' + box.id : '.' + String(box.className).split(' ')[0]) : '', ths, n: rows.length, sample };
      });
      // 탭·메뉴 주소 (주소의 값은 이름만)
      const links = [...new Set([...document.querySelectorAll('a[href]')].map(a => { try { const u = new URL(a.href, location.href); return u.host.endsWith('intolink.co.kr') ? u.pathname + (u.search ? '?' + [...u.searchParams.keys()].join('&') : '') : ''; } catch (e) { return ''; } }).filter(Boolean))].slice(0, 40);
      const tabs = [...document.querySelectorAll('.sub-menu, .category, .text, .title')].map(e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 20)).slice(0, 30);
      return { url: location.pathname, title: document.title, len: document.body.innerText.length, lines, frames: document.querySelectorAll('iframe').length, tables, links, tabs };
    } });
    page = r.result;
  } catch (e) { out.push('화면 읽기 실패: ' + e.message); }
  const am = v => String(v).replace(/[가-힣]/g, '가').replace(/[0-9]/g, '0').replace(/[A-Za-z]/g, 'a').slice(0, 50);
  if (page) {
    out.push('화면: ' + page.url + ' · 제목 ' + mask(page.title) + ' · 글자 ' + page.len + ' · iframe ' + page.frames);
    out.push('-- 표 --');
    page.tables.forEach((t, i) => {
      out.push(`표${i + 1} class="${t.cls}" 위치 ${t.box} · 줄 ${t.n}개`);
      out.push('  칸 제목: ' + (t.ths.length ? t.ths.map(h => '[' + h + ']').join(' ') : '(없음)'));
      t.sample.forEach((s, j) => {
        out.push(`  ${j + 1}번째 줄 속성: ` + (s.attrs.map(([k, v]) => k + '=' + (k === 'class' ? v : am(v))).join(' ') || '(없음)'));
        s.tds.forEach((c, k) => out.push(`    칸${k + 1}: ${mask(c.t)}` + (c.a.length ? '  {' + c.a.map(as => as.map(([n, v]) => n + '=' + am(v)).join(' ')).join(' | ') + '}' : '')));
      });
    });
    out.push('-- 탭·메뉴 글자 (화면 메뉴라 그대로, 숫자만 가림) --');
    out.push('  ' + page.tabs.map(x => '[' + x.replace(/[0-9]/g, '0') + ']').join(' '));
    out.push('-- 화면 안 주소 --');
    out.push('  ' + page.links.join('  '));
  }
  if (vue) {
    out.push('-- 화면 뒤 데이터 (칸 이름, 값은 가림) --');
    if (!vue.out.length) out.push('  (Vue 데이터 없음)');
    vue.out.forEach(x => out.push('  ' + x));
    out.push('  스크립트 변수: ' + (vue.vars.join(' ') || '(없음)'));
    out.push('  스크립트 길이: ' + vue.inlineLen.join(', '));
    out.push('  표 첫 줄: ' + (vue.click || '(못 찾음)'));
  }
  out.push('-- 화면이 받은 데이터 (주소만) --');
  let n = 0;
  for (const q of res) {
    const u = new URL(q.url); const p = u.host + u.pathname + (u.search ? ' ?' + [...u.searchParams.keys()].join('&') : '');
    let line = q.ty + ' ' + q.st + ' ' + p;
    if (false) {
      n++;
      try { const b = await dbg(tgt, 'Network.getResponseBody', { requestId: q.id }); const txt = b.base64Encoded ? atob(b.body) : b.body;
        try { line += '\n    → ' + shape(JSON.parse(txt), 0).slice(0, 1200); } catch (e) { line += '\n    → (JSON 아님) 길이 ' + txt.length; } } catch (e) { line += ' (내용 못 읽음)'; }
    }
    out.push(line);
  }
  chrome.debugger.onEvent.removeListener(on);
  try { if (tgt) await chrome.debugger.detach(tgt); } catch (e) {}
  await chrome.storage.session.set({ diag: out.join('\n') });
  await chrome.tabs.create({ url: chrome.runtime.getURL('result.html') });
  try { await chrome.tabs.remove(tab.id); } catch (e) {}
}

importScripts('find.js');
importScripts('probe.js');
importScripts('probe2.js');
importScripts('probe3.js');
importScripts('bgsync.js');
importScripts('netprobe.js');
