# 케어 노트 자동 테스트

가짜 Firebase(메모리)로 앱을 띄워 핵심 기능을 확인합니다. 실제 DB에는 접속하지 않습니다.

| 파일 | 확인하는 것 |
|---|---|
| rs_t.py | 실시간 연결 1개로 채팅·오더·환축·검진 반영 |
| q_t.py | 검사 오더 보내기 |
| lis_t.py | LIS 분석기 배정, 결과 알림 |
| an_t.py | 마취 기록 저장·삭제 |
| reg_t.py | 환축 번호 등록·중복 검사 |
| mj_t.py | 문진 접수 화면, 새 문진 알림 |
| up_t.py | 새 버전 알림 배너 |

실행: `cp index.html /tmp/srv/ && (cd /tmp/srv && python3 -m http.server 8123 &)` 후 `python3 tests/<파일>` (Playwright + google-chrome 필요).
올리기 전에 모두 `errors []`로 끝나는지 확인합니다.
