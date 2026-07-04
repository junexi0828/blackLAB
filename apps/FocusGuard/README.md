# FocusGuard

`폐관수련` 컨셉의 iPhone 공부 누적 앱입니다.

현재 MVP 기능:
- 총 누적 수련 시간 표시
- 오늘 수련 시간 표시
- 현재 회차 수련 시간 표시
- 입관 시작 / 수련 종료
- 수련 장부 기록 저장
- 차분한 동굴 전통 분위기 UI

## 열기

1. `apps/FocusGuard/FocusGuard.xcodeproj` 를 Xcode에서 엽니다.
2. 상단 Scheme가 `FocusGuard` 인지 확인합니다.
3. iPhone Simulator 또는 실제 iPhone을 선택합니다.
4. `Run` 을 누릅니다.

## 첫 실행

- 첫 실행 시 총 누적 시간은 0초입니다.
- `입관 시작`을 누르면 회차 시간이 올라갑니다.
- `수련 종료`를 누르면 총 누적 시간과 오늘 시간이 저장됩니다.
- 앱을 다시 열어도 UserDefaults에 기록이 남습니다.

## 개발 메모

- 프로젝트 생성: `xcodegen generate`
- 현재 번들 ID: `com.juns.beyondcave`
- 기본 타깃: iPhone 세로 화면
- 현재 구현은 화면 중심의 누적 기록 MVP입니다.
