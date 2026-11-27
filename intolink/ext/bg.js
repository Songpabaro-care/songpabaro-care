// 송파바로 인투링크 연동: 인투링크 화면을 읽기만 함 (인투링크에는 아무것도 쓰지 않음)
const UA = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';
const UAH = [
  { header: 'user-agent', operation: 'set', value: UA },
  { header: 'sec-ch-ua-mobile', operation: 'set', value: '?1' },
  { header: 'sec-ch-ua-platform', operation: 'set', value: '"Android"' }];
// 로그인 연장 때 잠깐 여는 탭: 인투링크 폰 화면으로 열기
async function uaRule(tabIds) {
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [1], addRules: [{ id: 1, priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: UAH }, condition: { requestDomains: ['intolink.co.kr'], tabIds } }] });
}
// 뒤에서 받아 오는 읽기(탭 없음): 인투링크 폰 화면으로 받기
async function bgRule(on) {
  if (!on) { await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [2] }); return; }
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [2], addRules: [{ id: 2, priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: UAH }, condition: { requestDomains: ['intolink.co.kr'], tabIds: [-1] } }] });
}
importScripts('bgsync.js');
importScripts('realsync.js');
