# Music Archive — Decision Log

초기 기록일: 2026-09-22. 아래 날짜는 문서화 날짜이며 과거 논의의 실제 결정 날짜를 추정하지 않는다.

최신 제품 사양은 [PRODUCT_SPEC](PRODUCT_SPEC.md), 구현 여부는 [ROADMAP](ROADMAP.md)가 기준이다. **Confirmed / Current Direction은 구현 완료를 뜻하지 않는다.** Candidate / Needs Decision은 미확정이며 Later / Out of MVP는 현재 MVP 밖이다. Superseded / Historical Alternative는 대체된 과거 대안으로, 이 문서에만 보존하며 현재 요구로 복구하지 않는다.

## 기록 관리

- 결정마다 상태, 내용, 이유, 필요한 후속 결정을 남긴다.
- 이후 결정이 바뀌면 기존 항목을 삭제하지 않고 변경일과 후속 결정 ID를 추가한다. 대체된 결정은 `Superseded`로 표시하고 최신 PRODUCT_SPEC도 갱신한다.
- 아래 이유는 제공된 프로젝트 목적·제약을 정리한 것이며, 수행하지 않은 실험이나 성능 비교를 근거로 주장하지 않는다.
- 설계 검토에서 새로 드러난 질문은 Open Decision에 출처를 구분해 기록한다. 확정 요구로 추가하지 않는다.

## Confirmed / Current Direction

### D-01 — 모바일 앱 구상에서 웹 MVP로 전환

- **상태:** Confirmed. 초기 모바일 앱 구상을 대체하는 최신 방향.
- **결정:** React 기반 웹 MVP에 집중하며 모바일 앱은 Later로 둔다.
- **이유:** 현재 React·TypeScript 학습 프로젝트와 웹 저장소를 중심으로, 완성 가능한 작은 범위에서 핵심 경험을 검증한다.
- **영향:** 모바일 앱 프로젝트나 플랫폼별 기능을 선제 생성하지 않는다.

### D-02 — 모바일 친화적인 반응형 웹

- **상태:** Confirmed.
- **결정:** 웹을 데스크톱 전용으로 만들지 않고 모바일에서도 사용하기 편하게 설계한다.
- **이유:** 웹 MVP에서도 다양한 화면에서 기억을 탐색하고 기록할 수 있어야 한다.
- **영향:** Timeline·폼·모달의 작은 화면 동작을 확인한다. 현재 구현이 반응형 검증을 마쳤다는 뜻은 아니다.

### D-03 — React + TypeScript + Vite + 일반 CSS

- **상태:** Confirmed, 현재 코드에도 적용됨.
- **결정:** 기존 스택을 유지한다. 기술 버전의 기준은 실제 `package.json`과 코드다.
- **이유:** React·TypeScript의 구조와 동작을 직접 배우고 기존 구현을 점진적으로 확장한다.
- **영향:** 설명 없는 스택 교체나 불필요한 dependency 추가를 피한다.

### D-04 — useState 중심, 라우터와 전역 상태 도구는 필요할 때

- **상태:** Current Direction.
- **결정:** 현재는 `useState`를 사용한다. 독립 화면·URL 탐색이 실제로 필요해지면 React Router를 검토한다. Redux·Zustand·복잡한 Context는 미리 도입하지 않는다.
- **이유:** 현재 규모에서 데이터 흐름을 이해하기 쉬운 구조를 유지한다.
- **영향:** 예상 화면 목록이 곧 라우터 설치나 전역 상태관리 도입 명령은 아니다.

### D-05 — 백엔드 없이 시작, localStorage 우선 검토

- **상태:** 서버 없는 초기 MVP는 Confirmed. localStorage는 Current Direction, v0.1 저장·복원 구현 완료.
- **결정:** 첫 저장 수단으로 localStorage를 사용한다. 서버·로그인·계정은 먼저 만들지 않는다. Supabase 등 DB는 Later다.
- **이유:** 백엔드 구축보다 기억 복원 경험 검증을 먼저 하고, 저장·복원도 작은 단계로 학습한다.
- **영향:** `music-archive-data`에 `{ userProfile, eras, music: { tracks, eraTracks } }`를 저장한다. 최초 state 초기화에서 복원하고 데이터 변경 시 Effect로 저장한다. 누락 목록은 빈 배열, 잘못된 항목·끊어진 관계는 제외한다. 프로필이 없거나 잘못되면 온보딩으로 시작한다. 읽기/JSON 오류는 초기 상태로 처리하고 쓰기 실패는 콘솔 경고 후 메모리 동작을 유지한다. 버전·migration은 이번 범위 밖이다.

### D-06 — Era-first 기억 복원

- **상태:** Confirmed.
- **결정:** `Remember → Reconstruct → Archive → Playlist`를 중심으로, Era를 선택한 뒤 해당 시절의 음악을 복원한다.
- **이유:** 남아 있지 않은 과거 기록을 사용자 기억을 통해 복원하는 것이 핵심 문제다.
- **영향:** 단순 통계·음악 수집 기능이 핵심 흐름보다 우선하지 않는다. Timeline은 음악 기록으로 들어가는 탐색 UI다.

### D-07 — 학교 Era 자동 생성과 수정

- **상태:** Confirmed, 기본 생성·수정 구현됨.
- **결정:** 한국의 일반 학제를 기준으로 초·중·고를 자동 생성한다. 시작은 출생연도 +7/+13/+16년의 3월, 종료는 다음 과정 전 2월 또는 고등학교 시작 +3년의 2월이다. 미래 과정은 제외하고 진행 과정은 현재 월까지만 생성한다.
- **이유:** 출생연도만으로 기억을 탐색할 기본 시기를 제공하되 실제 개인 이력의 예외를 수정할 수 있게 한다.
- **영향:** 대학·군대는 자동 생성하지 않는다. 필요하면 일반 Era로 직접 만들 수 있다. 기본 학교 Era는 서로 겹치지 않지만 수정에 따른 연쇄 변경은 O-01의 후보 UX다.

### D-08 — 일반 Era 중첩 허용

- **상태:** Confirmed, lane 배치 구현됨.
- **결정:** 일반 Era는 학교·다른 일반 Era와 겹칠 수 있다. 중첩은 Timeline의 여러 lane으로 표시한다.
- **이유:** 학교·아르바이트·동아리처럼 실제 삶의 시기는 동시에 존재할 수 있다.
- **영향:** 중첩을 입력 오류로 처리하지 않는다. Timeline은 월마다 고정 폭을 사용하는 픽셀 기반 시간축이며 긴 기간은 내부 가로 스크롤, 많은 Era는 내부 세로 스크롤로 탐색한다. 기본 막대에는 이름 중심의 최소 정보만 표시하고 클릭 시 상세 정보를 보여준다. 월당 픽셀 수·높이 같은 정확한 구현값은 ROADMAP에서 관리하며 영구 제품 요구로 고정하지 않는다.

### D-09 — 월 단위 Era와 별도 Moment/Event 구상

- **상태:** 월 단위 Era는 Confirmed. Moment/Event는 Later / Out of MVP.
- **결정:** Era는 `YYYY-MM` 단위의 비교적 긴 시기다. 여행·축제 등 짧은 사건은 향후 별도 개념으로 검토한다.
- **이유:** 긴 인생 시기와 짧은 기억을 하나의 기간 모델에 억지로 맞추지 않는다.
- **영향:** Moment/Event도 음악과 연결할 수 있지만 지금 타입·필드를 만들지 않는다.

### D-10 — 곡 중심 Seed, 최소 5곡과 최대 제한 없음

- **상태:** Confirmed / Current Direction. D-23에서 정확히 5곡과 완료 제한을 확정했다.
- **결정:** 기억나는 대표곡을 최소 정확히 5곡 선택하며 최대 개수는 제한하지 않는다. 개인적으로 중요한 ‘나만의 곡’을 강한 신호로 취급한다. 아티스트 자체를 Seed로 고르는 기능은 MVP에서 제외한다.
- **이유:** 인기곡만으로는 개인의 음악 기억을 충분히 표현하기 어렵다.
- **영향:** 당시 인기곡 후보 외에 개인 대표곡 검색을 고려한다. 곡 제목·아티스트·앨범 이미지·발매연도/발매일과 현재 복원 중인 Era의 시절 라벨/맥락을 표시한다. 사용자가 어느 시절에 관련된 후보인지 이해할 수 있게 하되 청취 사실을 확정하는 표시는 아니다.

### D-11 — 추천은 후보이며 사용자 확인이 Archive의 기준

- **상태:** Confirmed.
- **결정:** 추천된 것만으로 청취 기록을 생성하지 않는다. 해당 Era에서 들었다고 사용자가 확인한 음악만 Archive에 저장한다.
- **이유:** 시스템 추측을 사용자의 실제 과거 기록으로 오인하게 해서는 안 된다.
- **영향:** Seed 기반 추천과 사용자 피드백 기반 개선을 우선한다. Seed 유사성·시기·인기·과거 발매곡·평가 등을 조합할 수 있다. Era 중 발매된 곡만 허용하는 제한을 두지 않는다. 같은 아티스트·비슷한 장르·당시 연령/생활 단계·국가/시장은 Candidate 신호이며 필수 MVP 알고리즘이 아니다. 비슷한 사용자 기반 추천/collaborative filtering은 Later다. 구체적인 알고리즘은 미정이다.

### D-12 — RecommendationFeedback 유지, 미선택은 미평가

- **상태:** 반응 원칙은 Confirmed. RecommendationFeedback 모델과 미평가 레코드 미생성은 Current Direction, 미구현. 실제 타입·persistence 세부사항은 Open.
- **결정:** 특정 추천 Track에 대해 사용자가 특정 Era에서 어떤 반응을 했는지 기억하는 `RecommendationFeedback { eraId, trackId, status }` 개념을 유지한다. 명시적 status는 `LISTENED`, `UNASSIGNED`, `NOT_LISTENED`다. 미선택은 미평가로 RecommendationFeedback을 생성하지 않는다. `NOT_LISTENED`만 명시적 부정이며 `UNASSIGNED`는 부정이 아니다. 같은 Track도 Era가 다르면 다른 Feedback을 가질 수 있다.
- **이유:** 선택하지 않은 이유를 ‘듣지 않음’으로 추정할 수 없다. 기억나지만 시기가 불확실한 경우를 구별해야 한다.
- **영향:** `LISTENED`는 해당 Era Archive, `UNASSIGNED`는 별도 보관함으로 보낸다. 실제 TypeScript 타입의 추가 필드·별도 ID·timestamp·DB schema·persistence 구현 방식은 실제 구현 시 정한다. 불필요한 score/confidence/metadata를 미리 만들지 않는다. 과거 대안 H-01·H-02는 현재 요구가 아니다.

### D-13 — 약 30곡 추천과 아티스트 정렬

- **상태:** Current Direction. 추천 수는 UX 테스트 후 조정 가능.
- **결정:** 한 곡씩 넘기는 방식이 아닌, 약 30곡을 한 화면에서 함께 탐색하는 밀도 높은 목록/표를 사용한다. 화면 높이에 따라 목록 스크롤은 가능하다. 기본 정렬은 아티스트 이름 오름차순이며 아티스트별 그룹을 만들지 않는다. 별도 정렬 선택 기능은 현재 필요하지 않다. 같은 Era에서 이미 평가한 곡은 다음 후보에서 제외하고 `추천 더 보기`를 제공한다.
- **이유:** 후보를 탐색하기 쉽게 하고 반복 평가 부담을 줄인다.
- **영향:** 각 항목에는 최소 앨범 이미지·곡 제목·아티스트·발매연도/발매일·평가 상태/상태 아이콘을 표시한다. 목록 위에 간단한 상태 범례를 둔다. 곡 선택 시 항목 확장 또는 명확한 액션 영역에서 들었어요·시절 미정·안 들었어요를 고르게 한다. 기본 상태에서는 빠른 전체 탐색이 가능하고 선택한 평가 상태는 목록에서 바로 구분되어야 한다. 세부 시각 디자인은 구현 시 조정한다. Era Detail 음악 목록도 아티스트 기준 정렬을 사용하고 앨범별·장르별로 묶지 않는다.

### D-14 — Track은 실제 사용하는 최소 데이터

- **상태:** Current Direction, 일부 구현. v0.1의 `id`, `title`, `artist`에 Phase 4에서 실제 사용하는 optional `albumImageUrl`, `releaseDate`를 추가했다. 나머지는 실제 필요한 시점까지 미룬다.
- **결정:** 최소 모델 방향은 `id`, `title`, `artist`, `albumImageUrl`, `releaseDate`, `primaryGenre`다. 실제 필요하기 전 `album`, 서비스별 URL/ID, popularity, chartRanking, memo, 추천 metadata, 복잡한 다중 genre를 추가하지 않는다.
- **이유:** 사용하지 않는 데이터와 서비스 종속성이 모델을 불필요하게 복잡하게 만든다.
- **영향:** 미래 확장만을 이유로 필드를 선제 추가하지 않는다. 데이터 공급에 따른 결측값 처리 등은 실제 구현 시 결정한다. `primaryGenre`를 사용하는 것은 현재 장르 자동분류 시스템을 구현하라는 의미가 아니다.

### D-15 — EraTrack으로 Era와 Track의 다대다 관계 표현

- **상태:** 다대다 관계는 Confirmed. EraTrack 관계 모델 사용은 Current Direction. 지원용 v0.1에서 최소 타입과 메모리 관계 목록 구현. localStorage 저장·복원 구현. 기존 곡을 여러 Era에 배정하는 UI는 미구현.
- **결정:** Track 자체와 Era에 저장된 관계를 분리하고 `EraTrack { eraId, trackId }` 관계 개념을 사용한다. 한 Track은 여러 Era에, 한 Era에는 여러 Track이 포함될 수 있다. 관계 모델 자체를 단순한 가능성으로 두지 않는다.
- **이유:** 한 번의 청취 시기로 음악의 개인적 의미를 제한하지 않는다.
- **영향:** 가장 단순한 구현·저장 방식을 실제 구현 시 선택한다. `addedFrom`, `memo`, `evidence`, 불필요한 recommendation metadata와 현재 사용하지 않는 관계 metadata는 미리 넣지 않는다. 실제 기능에서 필요할 때만 검토한다.

### D-16 — Unassigned와 별도 UnassignedTrack 모델

- **상태:** Unassigned 개념은 Confirmed. 별도 UnassignedTrack 모델은 Current Direction, 미구현. `sourceEraId` 보관은 Candidate.
- **결정:** 곡은 기억나지만 어느 Era에서 들었는지 확신하지 못하는 Track을 임시 보관하기 위해 별도 `UnassignedTrack` 개념을 사용한다. 일반 Era가 아니므로 자체 기간과 Era용 description은 필요 없다. 이후 Era 선택 UI로 한 곡을 여러 Era에 배정할 수 있게 한다.
- **이유:** 불확실한 기억을 버리거나 임의의 Era에 사실처럼 저장하지 않는다.
- **영향:** 발견 맥락을 위한 `sourceEraId`를 고려하되 실제 청취 Era로 취급하지 않는다. 구체적인 타입·저장 방식, 중복, 여러 sourceEraId, 출처 삭제, Era 배정 후 보관함에서 제거할지는 O-06에서 결정한다.

### D-17 — 내부 Playlist 우선, 외부·소셜·통계는 이후

- **상태:** 내부 Era Playlist는 Current Direction. 외부 서비스·공유·통계 고도화는 Later.
- **결정:** MVP는 복원된 음악으로 Music Archive 내부의 Era Playlist 경험을 완성한다. Spotify·Apple Music 연동/내보내기/과거 기록 가져오기, 공유·카드·친구 비교, 통계·모바일 앱은 미룬다.
- **이유:** 핵심 복원 경험을 완성하기 전에 범위와 서비스 의존성을 키우지 않는다.
- **영향:** 초기 아이디어인 좋아하는 곡의 장르 자동분류, Era별 장르 통계·취향 변화는 Later다. 간단한 통계도 핵심 복원 경험보다 우선하지 않는다. 비슷한 사용자들의 선택을 활용하는 추천/collaborative filtering도 Later다. Playlist 표현과 데이터 모델은 실제 구현 시 정한다.

### D-18 — 학습 중심의 작은 변경과 단순한 구조

- **상태:** Confirmed.
- **결정:** 설명 → 이해 → 구현 → 검증을 따른다. 큰 변경은 파일·이유·계획을 먼저 설명하고 작은 기능 단위로 개발한다. 필요 전 과도한 abstraction, generic, 디자인 패턴, 컴포넌트 세분화, dependency를 도입하지 않는다.
- **이유:** 사용자가 React·TypeScript를 직접 배우고 사람이 읽을 수 있는 코드를 유지하는 것이 프로젝트 목적이다.
- **영향:** 현재 코드와 동작을 먼저 확인하며 불필요한 재작성을 피한다. 리팩터링은 동작 보존을 우선하고, 상태 위치·props·불변성 등 핵심 개념을 설명한다. 검토만 요청받았다면 구현하지 않는다.

### D-19 — 기능 단위 commit/push와 정직한 검증 보고

- **상태:** Confirmed.
- **결정:** 의미 있는 기능이 완료되면 다음 기능 전에 commit/push 시점을 안내한다. 서로 관련 없는 기능을 한 커밋에 섞지 않는다. 중요한 Git 이력 변경이나 위험한 reset/rebase는 명시적 요청 없이 하지 않는다.
- **이유:** 학습 단위와 변경 이유를 추적하고 안정적인 돌아갈 지점을 남긴다.
- **영향:** 코드 변경 후 타입·린트·가능하면 build와 필요한 사용자 흐름을 확인하고, 검증하지 못한 항목은 구분한다. 이번 문서 작성에서는 commit/push를 수행하지 않는다.

### D-20 — Repository 문서가 개발 기준

- **상태:** Confirmed.
- **결정:** AGENTS는 짧은 규칙, PRODUCT_SPEC은 최신 사양, ROADMAP은 실제 구현 상태, DECISIONS는 이유·변경 이력을 맡는다. 큰 변경 후 관련 문서를 갱신한다.
- **이유:** 하나의 대화에 의존하지 않고 프로젝트 방향과 현재 상태를 지속적으로 전달한다.
- **영향:** 문서와 코드가 다르면 차이를 알린다. Notion은 선택적 보조 기록이며 자동 관리하지 않는다. 요청 시 하루 종합 기록 하나와 최종 반영 시각을 선호한다.

### D-21 — App 역할 분리와 폼 로컬 상태

- **상태:** Confirmed, 2026-09-22 구현 완료. 기존 O-08의 분리 경계를 확정했다. 아직 커밋하지 않았다.
- **결정:** Onboarding·Timeline·EraDetail·EraModal 4개 컴포넌트, `types/era.ts`, `utils/date.ts`, `utils/era.ts`로 분리한다. App에는 프로필·Era 목록·선택/수정 ID·모달 표시 상태와 데이터 갱신·화면 연결을 남긴다. UserProfile은 App 내부에 유지한다.
- **이유:** 음악 기능 추가 전에 현재 데이터 흐름을 이해하기 쉽게 만들고, UI·입력과 독립 계산의 변경 범위를 나눈다. 단순히 줄 수를 줄이기 위한 세분화는 하지 않는다.
- **입력과 props:** Onboarding은 검증된 출생연도를 `onComplete`로 전달한다. Timeline은 Era 목록·기간·선택 ID를 받아 표시하고 선택을 알린다. EraDetail은 Era와 수정 콜백을 받는다. EraModal은 수정 대상 또는 null, 월 범위, 저장·닫기 콜백을 받아 `EraFormValues`를 제출한다.
- **상태 수명:** 모달은 열릴 때만 마운트하며 생성은 빈 값, 수정은 기존 Era 값으로 입력 상태를 초기화한다. 닫히면 임시 상태가 사라지므로 App의 반복 초기화나 동기화 Effect가 필요 없다. 향후 열린 모달에서 수정 대상을 교체하는 기능이 생기면 상태 초기화 정책을 다시 검토한다.
- **영향:** 표시용 좌표·크기는 Timeline에, 학교 생성·lane 배치는 유틸리티에 둔다. 선택·수정 대상과 좌표는 파생값으로 계산한다. 기존 JSX·검증·날짜 규칙을 유지하도록 이동하고 CSS·의존성은 변경하지 않았다. 삭제·저장·음악 기능은 추가하지 않았다. 검증 범위와 한계는 ROADMAP 9절에 기록한다.

### D-22 — 2026-09-29 지원용 v0.1 음악 검색 REST API 도입

- **상태:** Confirmed / Current Direction, 구현 완료.
- **결정:** 지원용 v0.1에서 iTunes Search API 기반 곡 검색·선택 추가만 제한적으로 선행 구현한다. 기존 곡 직접 입력 기능은 유지한다.
- **구조:** 외부 요청과 응답 변환은 `src/services/musicSearch.ts`의 `searchMusic(query)`에 둔다. `src/types/musicSearch.ts`의 도입 당시 공통 결과 타입은 `externalId`, `title`, `artist`만 가졌다. 이후 D-23에서 optional 이미지·발매일을 추가했다. EraTracks는 iTunes 원본 필드에 직접 의존하지 않는다.
- **ID와 저장:** iTunes `trackId`는 문자열 `externalId`로 변환해 검색 결과 식별에만 사용한다. 내부 `Track.id`는 기존 `crypto.randomUUID()`를 유지한다. 검색 선택과 직접 입력은 동일한 Track 생성·Era 연결·localStorage 저장 흐름을 사용하며 externalId는 영구 저장하지 않는다.
- **이유:** 실제 REST API 검색 흐름을 구현하면서 UI와 핵심 저장 모델이 특정 서비스에 종속되지 않게 한다. 이후 Spotify·Apple Music 등으로 교체·확장할 수 있도록 작은 검색 계층만 분리하며 Provider/Strategy/Factory는 도입하지 않는다.
- **범위:** 앞선 외부 API Later 방향에서 기본 검색만 선행한 결정이다. Spotify·Apple Music 정식 계정 연동·내보내기·과거 기록 가져오기는 여전히 Later다. Seed·추천·Unassigned 등 장기 기능의 구현 여부나 우선순위는 변경하지 않는다.

### D-23 — Phase 4 Seed Selection 확정과 임시 복원 세션

- **상태:** Confirmed / Current Direction, 구현 완료.
- **결정:** 최소 정확히 5곡, 최대 제한 없음. 기존 Era 곡은 후보지만 자동 선택하지 않는다. 검색과 직접 입력한 나만의 곡도 선택·해제할 수 있다. 선택 중에는 Archive/localStorage를 변경하지 않으며 뒤로 가면 미확정 상태를 버린다.
- **확정 의미:** 최종 완료는 해당 Era에서 들었다는 명시적 사용자 확인이다. 기존 곡은 재사용하고 새로운 곡만 Track + EraTrack으로 저장한다. 같은 Era에서 trim 후 title + artist를 대소문자 무시 비교해 중복을 합치되 전역 병합은 하지 않는다. 동명이곡/버전 식별은 별도 결정이다.
- **세션:** App은 `{ eraId, trackIds }`만 임시로 기억한다. 영구 Seed entity·DB·timestamp·score·weight를 만들거나 세션을 localStorage에 저장하지 않는다. 확정 후 Era Detail 복귀는 Phase 5 이전의 임시 연결이다. 재진입은 새 미선택 초안이며 취소는 이전 확정 세션을 바꾸지 않는다. 해당 Era에서 곡을 삭제하면 오래된 세션을 해제한다.
- **메타데이터:** Track·MusicSearchResult에 optional albumImageUrl/releaseDate를 추가하고 이미지·발매연도를 실제 표시한다. 없거나 잘못된 metadata는 생략하고 기존 Track은 복원한다. iTunes artworkUrl100/releaseDate에서 유효한 값만 변환한다. externalId는 검색 전용이며 영구 Track ID는 UUID다.
- **구조:** 작은 MusicSearch 컴포넌트를 두 화면에서 공유하고 TrackSummary로 이미지·제목·아티스트·연도 표시를 통일한다. TrackInput 객체로 실제 필드만 전달하고 createTrack에서 영구 필드만 골라 저장한다. Router·새 dependency·Provider 패턴은 추가하지 않는다.
- **범위:** 역사적 인기곡은 신뢰 가능한 공급 방식 결정 전 미구현이다. iTunes를 과거 차트로 사용하지 않고 임의 샘플도 만들지 않는다. 추천 알고리즘·Feedback·Unassigned 등 Phase 5 이후 기능은 추가하지 않는다.

### D-24 — 2026-09-30 검색 우선 UX와 Era별 추가 규칙 공통화

- **상태:** Confirmed / Current Direction, 구현 완료.
- **결정:** EraTracks와 SeedSelection이 공유하는 MusicSearch에서 검색을 우선하고 검색 완료 후 결과 유무·실패 여부와 관계없이 직접 입력 fallback을 제공한다. 직접 입력 Track에는 releaseDate를 생성하지 않는다.
- **기간:** D-11의 과거 발매곡 허용 원칙을 유지한다. 유효한 발매일의 원본 YYYY-MM이 Era 종료 월 이후일 때만 제외하며 같은 월·이전 곡·발매일 결측/판별 불가는 허용한다. UI 후보 필터와 공통 추가 로직에서 같은 검사를 사용한다. 추천 시스템 구현을 뜻하지 않는다.
- **중복:** Seed 확정에만 있던 검사를 일반 검색·직접 입력에도 적용하도록 addTracksToEra로 공통화했다. 같은 Era에서 title + artist를 trim·대소문자 무시 비교해 기존 ID를 재사용한다. 전역 병합·기존 중복 데이터 정리는 하지 않는다.
- **조회:** iTunes 후보 50개를 한 번 조회한 뒤 Era 필터를 적용하고 최대 10개를 표시한다. 처음 10개에서 미래 곡을 제거하면 결과가 지나치게 줄어드는 문제를 완화하기 위한 단순한 여유분이다. 항상 10개를 보장하지 않으며 pagination·자동 추가 요청은 도입하지 않는다. 숫자는 현 구현 선택이며 영구 제품 요구가 아니다.
- **후속 UI 방향, 미구현:** 현재 세로형 UI는 핵심 기능 검증용 임시 구조다. 데스크톱은 왼쪽 Era 탐색/내비게이션과 오른쪽 선택한 Era 음악 작업 영역을 목표로 한다. Seed·Memory Reconstruction 흐름이 자리 잡은 뒤 구조화하며 Phase 4에서는 레이아웃을 변경하지 않는다.

## Candidate / Open Decisions

Resolved로 표시한 이력 행을 제외한 아래 질문은 아직 확정되지 않았다. 해당 기능을 실제 구현할 때 필요한 항목부터 결정한다. 여기의 후보는 구현 권한이나 새로운 필수 기능을 뜻하지 않는다.

| ID | 출처·주제 | 현재 후보/미결정 사항 | 결정 시점 |
| --- | --- | --- | --- |
| O-01 | 사용자 제안: 학교 Era 예외 | “이후 학교 Era도 함께 이동할까요?” 확인 UX. 대상·이동량·이미 편집된 학교 Era·기간 충돌 처리 미정. 무경고 자동 변경 금지 방향. | 핵심 MVP 이후 필요 시, 낮은 우선순위 |
| O-02 (Resolved) | 사용자 제안: Seed 개수 UX | D-23으로 최소 정확히 5곡, 0~4곡 완료 불가, 최대 제한 없음 확정·구현. | 해결됨: D-23 |
| O-03 | 코드·기획 대조 + 사용자 아이디어: 음악 데이터·신호 | 기본 검색은 D-22의 iTunes API로 구현했다. 인기곡·추천용 데이터는 로컬/샘플 데이터 등 공급 방식을 별도 검토하며 정식 서비스 연동은 Later다. Seed·피드백 우선. 같은 아티스트·비슷한 장르·당시 연령/생활 단계·국가/시장은 Candidate 신호로 사용 여부·가중치 미정. 약 30곡의 정확한 수는 조정 가능. collaborative filtering은 Later. | 음악 데이터 흐름과 추천 구현 전 |
| O-04 | 사용자 방향 + 설계 검토: RecommendationFeedback 구현 | 모델 유지, eraId·trackId·status의 최소 의미, 세 status와 미평가 레코드 미생성은 Current Direction. 추가 필드·별도 ID·timestamp·DB schema·persistence, 평가 변경/취소와 미평가 재노출 정책만 미정. | 피드백 구현 전 |
| O-05 | 사용자 방향 + 설계 검토: EraTrack 구현·Seed | EraTrack 다대다 관계와 한 Track 여러 Era는 현재 방향. 최소 타입·localStorage 구현 완료. D-23에서 Seed 최종 확정은 청취 확인으로 정하고 같은 Era의 title + artist 중복 및 optional metadata 결측 처리를 구현했다. 전역 Track identity와 다른 버전 판별은 미정. | 음악 Archive·Seed 구현 전 |
| O-06 | 사용자 방향 + 설계 검토: UnassignedTrack 구현 | 별도 UnassignedTrack 모델은 현재 방향. `sourceEraId`는 발견 맥락 후보이며 청취 Era가 아님. 구체적 타입·저장 방식, 여러 출처, 중복 저장, 출처 Era 삭제, 배정 후 잔류/제거 정책 미정. | 최소 시절 미정 보관 구현 전 |
| O-07 | 사용자 방향 + 코드 검토: 저장·진행 중 Era | 저장 키·형식·기본 복원 검증·실패 처리는 D-05로 결정하고 구현했다. 학교 Era 기간은 저장된 값 그대로 복원하며 자동 연장은 하지 않는다. 향후 연장 정책은 미정. migration은 이번 범위 밖이다. | 지속성 구현 전 |
| O-08 (Resolved) | 앞선 구조 검토: 리팩터링 경계 | 2026-09-22 D-21로 확정하고 구현 완료. 추적 이력을 위해 행을 유지하며 더 이상 Open Decision이 아니다. | 해결됨: D-21 |
| O-09 | 사용자 방향 + 설계 검토: 내부 Playlist·라우팅 | Playlist가 Era Archive의 표현인지 별도 모델인지, 독립 URL·라우터가 필요한 시점은 미정. | 해당 화면의 실제 확장 시 |

## Superseded / Historical Alternative

아래 두 항목은 사용자가 이번 문서 보완에서 알려준 과거 검토 아이디어다. 실제 최초 논의 날짜는 알 수 없으며 기록일은 2026-09-22다. 현재 요구로 복구하지 않고 이 문서에만 남긴다.

### H-01 — 과거의 세분화된 다섯 가지 피드백

- **상태:** Superseded / Historical Alternative. D-12의 현재 구조로 대체됨.
- **과거 대안:** 많이 들었음 / 좋아했음 / 들어본 적 있음 / 기억 안 남 / 안 들었음.
- **대체 이유:** UX와 데이터 구조를 단순화하고 해당 Era의 청취 확인, 시절 불확실성, 명시적 부정을 구분한다.
- **현재 방향:** `LISTENED` / `UNASSIGNED` / `NOT_LISTENED`, 미선택은 미평가이며 RecommendationFeedback을 생성하지 않는다. 과거 다섯 응답을 추가 status나 입력 UI로 되살리지 않는다.

### H-02 — 추천 결과의 신뢰도 분류

- **상태:** Superseded / Historical Alternative. D-11·D-12의 후보/사용자 확인 구분과 현재 피드백 구조로 대체됨.
- **과거 대안:** Confirmed / Remembered / Suggested로 추천 결과의 신뢰도를 구분하는 아이디어.
- **대체 이유:** UX와 데이터 구조를 단순화하며 시스템의 추천과 사용자가 확인한 청취 기록을 구분한다.
- **현재 방향:** 세 가지 명시적 Feedback과 미평가를 사용한다. 과거 신뢰도 분류나 관련 metadata를 현재 모델에 추가하지 않는다. 이 과거 Track 신뢰도 용어는 문서 결정 상태인 Confirmed / Current Direction과 별개다.

## 충돌·범위 해석 기록

- **모바일 앱 vs 웹:** 최신 결정 D-01을 적용한다. 모바일 앱은 Later, 모바일 친화적인 웹은 현재 방향이다.
- **큰 Track 모델 vs 최소 데이터:** D-14가 최신 방향이다. 앞선 대화의 곡 링크·메모 수동 입력 제안은 채택된 요구가 아니며 현재 필드로 추가하지 않는다.
- **미선택 vs 부정 평가:** D-12를 적용한다. `NOT_LISTENED`를 직접 선택한 경우만 명시적 부정이다.
- **학교 Era 기본 비중첩 vs 수정 후 겹침:** 자동 생성의 기본 성질과 사용자 수정 정책을 구분한다. 현재 코드는 수정 후 겹침을 금지하거나 이후 Era를 자동 이동하지 않는다.
- **검색·추천 필요 vs 외부 API Later:** 제품 기능과 데이터 공급 수단은 별개다. D-22에 따라 지원용 v0.1에서 기본 곡 검색만 선행 구현했다. 정식 서비스 연동은 Later이며 인기곡·추천 데이터는 O-03에서 별도 결정한다.
- **최소 metadata vs sourceEraId:** Track에 불필요한 출처를 넣지 않는 원칙과 Unassigned 발견 맥락 후보를 구분한다. O-06의 필요성이 확인될 때만 최소 필드를 검토한다.
- **추천 후보 vs 실제 Archive:** 후보 생성·선택 중에는 Archive를 바꾸지 않는다. D-23에 따라 사용자가 Seed를 최종 완료한 경우에만 해당 Era 청취 확인으로 처리한다. 추천 후보의 자동 저장은 여전히 금지한다.
- **관계 모델 vs 구현 세부사항:** RecommendationFeedback·EraTrack·UnassignedTrack 모델은 Current Direction이다. 미평가 레코드 미생성도 현재 방향이며, 실제 타입 추가 필드·저장 방식 등이 Open이라는 이유로 모델 자체를 미정으로 되돌리지 않는다.
- **과거 피드백 vs 현재 구조:** H-01·H-02는 Historical에만 보존한다. D-12의 세 명시적 status와 미평가 원칙에 섞지 않는다.

## 변경 이력

| 기록일 | 내용 |
| --- | --- |
| 2026-09-22 | 사용자 제공 기획과 커밋 `888ac47`의 실제 코드를 바탕으로 초기 결정 기록 작성. 확정 방향·미결정 후보·Later와 미구현 상태를 구분. 기능 코드 변경 없음. |
| 2026-09-22 (보완) | 사용자 정정에 따라 D-12·D-15·D-16에서 모델 자체와 구현 세부사항의 상태를 구분하고, O-04~O-06을 구현 질문으로 한정. 추천 목록·Timeline·Seed 맥락을 구체화하고 추가 신호의 Candidate/Later와 과거 대안 H-01·H-02를 기록. 코드 변경 없음. |
| 2026-09-22 (리팩터링 기록) | 앞선 코드 리팩터링의 실제 결과를 D-21에 기록하고 O-08을 Resolved로 전환. ROADMAP의 코드 구조·완료 상태·검증 범위를 갱신. 이번 문서 갱신에서는 기능 코드 변경 및 commit/push 없음. |
| 2026-09-29 (음악 검색) | D-22에 v0.1 iTunes 검색 선행 구현, 공통 검색 service·타입, 내부 UUID와 externalId 분리, 기존 저장 흐름 재사용을 기록. 정식 서비스 연동의 Later 방향은 유지. |
| Phase 4 구현 | D-23에 정확히 5곡·확정 시 청취 확인·임시 세션·Era 내 중복·optional metadata 결정을 기록. O-02 해결, O-05의 잔여 전역 식별 질문을 분리. |
