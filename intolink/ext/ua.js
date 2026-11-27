// 진단 탭에서만 폰처럼 보이게 (주소 끝 #sbm 표시가 있었던 탭)
(function () {
  try {
    if (location.hash.indexOf('sbm') >= 0) sessionStorage.setItem('sbm', '1');
    if (sessionStorage.getItem('sbm') !== '1') return;
    var ua = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';
    Object.defineProperty(navigator, 'userAgent', { get: function () { return ua; } });
    Object.defineProperty(navigator, 'platform', { get: function () { return 'Linux armv8l'; } });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: function () { return 5; } });
  } catch (e) {}
})();
