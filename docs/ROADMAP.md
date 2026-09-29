# Music Archive — Roadmap

최신 Phase 4 구현: Seed Selection 완료(기존 곡·검색·직접 입력, 5곡 이상 확정). 당시 인기곡 공급과 Phase 5 추천은 미구현. 아래 날짜별 기록은 각 시점의 범위를 보존한다.

최신 추가 구현(2026-09-29): 지원용 v0.1 Era별 곡 관리, localStorage 저장·복원, iTunes Search API 기반 검색·선택 추가 완료. Live Demo 배포 완료(사용자 확인 및 README 기준). 아래 Phase 1 구조·줄 수·리팩터링 설명은 2026-09-22 당시 기록이며, 최신 곡 기능과 검증은 마지막 절을 따른다.

코드 확인일: 2026-09-22. 기준은 `888ac47` (`feat: implement era timeline and management`) 이후의 현재 작업 폴더이며, 아래 리팩터링 변경은 아직 커밋되지 않았다.

이 문서는 실제 구현 상태와 다음 작업을 기록한다. 제품 방향은 [PRODUCT_SPEC](PRODUCT_SPEC.md), 결정 이유와 미결정 사항은 [DECISIONS](DECISIONS.md), 개발 규칙은 [AGENTS](../AGENTS.md)를 따른다. 기능 변경 후 코드와 함께 갱신한다.

## 1. 상태 표기와 현재 위치

- **완료:** 실제 코드에 구현되어 있음. 브라우저 동작 검증 여부와는 별개다.
- **진행:** 구현에 착수했지만 완료되지 않음.
- **예정:** 방향 또는 작업 계획만 존재함. 구현된 것으로 해석하지 않는다.
- **Later:** 현재 MVP 밖의 확장 후보.

위 표기는 구현 진행 상태다. 제품 결정의 Confirmed / Current Direction, Candidate / Needs Decision, Later / Out of MVP, Superseded / Historical Alternative와 구분한다. 과거 대안의 상세 내용은 DECISIONS에만 기록하며 예정 기능으로 복구하지 않는다.

리팩터링 당시에는 **Era 관리·Timeline 기반과 App 구조 분리가 완료된 Phase 1**이다. 컴포넌트 4개, Era 타입, 날짜·Era 유틸리티 분리를 구현했고 타입 검사·린트·빌드 및 일부 브라우저 흐름을 확인했다. 검증 범위는 9절에 기록한다. 당시 Era 삭제·폼 검증 개선·저장 기능은 구현하지 않았다. 이번 문서 갱신에서는 기능 코드·UI를 수정하거나 commit/push하지 않는다.

## 2. 실제 구현 완료

| 영역 | 코드로 확인한 동작 | 근거 |
| --- | --- | --- |
| 온보딩 | 출생연도 입력, 1900~현재 연도의 정수 검증, 빈 입력 시 제출 버튼 비활성화 | `components/Onboarding.tsx`의 `handleSubmit` |
| 프로필 | 출생연도로 프로필 생성 후 온보딩에서 타임라인으로 전환 | `userProfile`, 현재 ID는 `user-1` 고정 |
| 학교 Era | 초·중·고 생성, 미래 과정 제외, 진행 과정의 종료 월을 현재 월로 제한 | `utils/era.ts`의 `createSchoolEras` |
| Era 생성 | 이름·시작 월·종료 월·선택적 설명 입력, UUID 생성, `CUSTOM` 저장 | `EraModal.tsx`의 입력, App의 `handleSaveEra` |
| Era 선택·상세 | 막대 클릭 시 선택 표시, 이름·기간·설명·수정 버튼 표시 | App의 선택 상태, `Timeline.tsx`, `EraDetail.tsx` |
| Era 수정 | 기존 입력값을 모달에 채우고 해당 Era만 갱신. 학교 Era도 수정 가능 | App의 `openEditEraModal`·`handleSaveEra`, `EraModal.tsx` |
| 기간 검증 | 출생연도 1월~현재 월 범위, 시작 월이 종료 월보다 늦지 않도록 검사 | `EraModal.tsx`의 월 입력 `min`/`max`와 `handleSubmit` |
| Timeline | 출생연도 1월부터 현재 월까지 월 단위 시간축과 연도 눈금 표시 | `utils/date.ts`, `components/Timeline.tsx` |
| 겹침 배치 | 시작 월 순으로 정렬한 복사본을 사용하고 겹치는 Era를 다른 lane에 배치 | `utils/era.ts`의 `assignEraLanes` |
| 스크롤 | 가로·세로 스크롤과 상단에 유지되는 연도 행 | `timeline.css`의 `overflow: auto`, `position: sticky` |
| 모달 | 생성·수정 공용 입력 화면, 취소와 저장 후 닫기·입력 초기화 | App의 조건부 렌더링, `EraModal.tsx`의 로컬 상태, `modal.css` |
| 음악 검색 | iTunes 후보 50개를 한 번 조회, Era 발매월 필터 후 최대 10곡 표시. 검색 후 직접 입력 fallback, 공통 추가 흐름의 Era 내 중복 방지 | `services/musicSearch.ts`, `types/musicSearch.ts`, `MusicSearch.tsx`, `utils/track.ts`, App의 `handleAddTrack` |

### 날짜와 배치의 현재 규칙

출생연도를 `B`라고 할 때 기본 학교 기간은 다음과 같다.

- 초등학교: `(B + 7)-03` ~ `(B + 13)-02`
- 중학교: `(B + 13)-03` ~ `(B + 16)-02`
- 고등학교: `(B + 16)-03` ~ `(B + 19)-02`

시작 월이 현재 월보다 늦으면 생성하지 않는다. 종료 월이 미래면 생성 시 현재 월로 잘라 저장한다. 실제 생일은 받지 않으며 날짜는 브라우저 로컬 시간을 사용한다.

`monthToIndex`는 `year * 12 + (month - 1)`로 월을 숫자로 바꾼다. 막대는 시작·종료 월 모두 포함한다. 이전 Era 종료 월보다 다음 Era 시작 월이 **엄격히 뒤일 때** 같은 lane을 사용한다. 같은 월을 공유하면 겹침으로 처리한다.

현재 한 달 너비는 8px, lane 간격은 72px, 스크롤 영역 높이는 380px다. Era 영역 높이는 lane 수에 따라 늘어난다. 이 숫자는 현재 구현값이며 영구 제품 요구가 아니다. 제품 방향은 월별 고정 폭의 픽셀 시간축, Timeline 내부 가로·세로 스크롤, 겹침 lane, 이름 중심 막대와 클릭 시 상세 확인이다.

### 현재 데이터 모델과 상태

- `UserProfile`: `id`, `birthYear`. App에서만 사용하므로 `App.tsx`에 유지한다.
- `Era`: `id`, `name`, `startMonth`, `endMonth`, 선택적 `description`, `origin`, 선택적 `schoolStage`. `types/era.ts`에 정의한다.
- `EraFormValues`: 이름·시작 월·종료 월·설명의 폼 제출 타입. `types/era.ts`에 정의하며 ID·학교 구분 등 저장 데이터의 다른 필드는 포함하지 않는다.
- `origin`: `AUTO_SCHOOL` 또는 `CUSTOM`. `schoolStage`: `ELEMENTARY`, `MIDDLE`, `HIGH`.
- `EraWithLane`: Era와 계산된 lane 번호를 묶은 표시용 결과. `utils/era.ts` 내부 타입이다.
- App은 프로필, Era 목록, 선택·수정 ID와 모달 열림 여부를 `useState`로 관리한다. Onboarding은 출생연도 입력값, EraModal은 네 개의 임시 입력값을 각각 로컬 상태로 관리한다.
- 선택·수정 대상 Era는 별도 객체 상태 없이 `eras`와 ID에서 찾는다. Timeline의 좌표·크기·lane도 props에서 계산한다. 수정은 `map`, 생성은 전개 문법으로 새 배열을 만든다.
- 모달은 열릴 때만 마운트한다. 생성 시 빈 값, 수정 시 Era 값으로 초기화하며 닫으면 임시 상태가 사라진다. 현재는 열린 채 수정 대상을 교체하는 흐름이 없으므로 props 동기화용 Effect를 추가하지 않았다.
- 수정 시 기존 `id`, `origin`, `schoolStage`는 유지한다.

### 아직 없는 기능

Era 삭제, 출생연도 재설정 UI, 역사적 인기곡 후보, 추천·피드백, Unassigned, Playlist, Spotify·Apple Music 정식 계정 연동, 서버·로그인·계정은 구현되지 않았다. 기본 곡 검색 API는 지원용 v0.1에서 선행 구현했다. 프로필·Era·곡은 localStorage로 복원한다. 학교 Era 수정에 따른 연쇄 기간 조정도 없다.

RecommendationFeedback, UnassignedTrack은 **문서상 Current Direction인 모델이며 코드에는 아직 없다.** EraTrack은 v0.1에서 최소 관계 타입과 메모리 목록을 구현했다. localStorage 저장·복원을 구현했다.

## 3. 현재 폴더와 코드 구조

아래는 문서 작성 후의 구조다. `node_modules/`와 `.git/` 내부는 생략한다.

```text
music-archive/
├─ AGENTS.md
├─ docs/
│  ├─ PRODUCT_SPEC.md
│  ├─ ROADMAP.md
│  └─ DECISIONS.md
├─ public/
│  ├─ favicon.svg
│  └─ icons.svg
├─ src/
│  ├─ assets/
│  │  ├─ hero.png
│  │  ├─ react.svg
│  │  └─ vite.svg
│  ├─ components/
│  │  ├─ Onboarding.tsx
│  │  ├─ Timeline.tsx
│  │  ├─ EraDetail.tsx
│  │  ├─ EraModal.tsx
│  │  ├─ EraTracks.tsx
│  │  ├─ SeedSelection.tsx
│  │  ├─ MusicSearch.tsx
│  │  └─ TrackSummary.tsx
│  ├─ services/
│  │  └─ musicSearch.ts
│  ├─ types/
│  │  ├─ era.ts
│  │  ├─ track.ts
│  │  └─ musicSearch.ts
│  ├─ utils/
│  │  ├─ date.ts
│  │  ├─ era.ts
│  │  ├─ storage.ts
│  │  └─ track.ts
│  ├─ styles/
│  │  ├─ onboarding.css
│  │  ├─ timeline.css
│  │  ├─ modal.css
│  │  └─ seed-selection.css
│  ├─ App.tsx
│  ├─ index.css
│  └─ main.tsx
├─ .gitignore
├─ README.md
├─ package.json
├─ package-lock.json
├─ index.html
├─ vite.config.ts
├─ eslint.config.js
├─ tsconfig.json
├─ tsconfig.app.json
└─ tsconfig.node.json
```

| 파일 | 현재 책임 |
| --- | --- |
| `src/App.tsx` | 725줄에서 129줄로 분리. 공유 상태, 프로필·Era 갱신, 모달 제어, 헤더와 컴포넌트 연결을 담당한다. |
| `src/components/Onboarding.tsx` | 출생연도 입력·검증 후 `onComplete`로 확정된 숫자를 전달한다. |
| `src/components/Timeline.tsx` | 연도·막대·스크롤 영역과 표시용 좌표·크기를 계산하고 선택 ID를 전달한다. |
| `src/components/EraDetail.tsx` | 선택한 Era 정보와 수정 버튼을 표시한다. |
| `src/components/EraModal.tsx` | 생성·수정 임시 입력과 기존 검증을 담당하고 `onSave`로 입력값을 전달한다. |
| `src/components/EraTracks.tsx` | 공통 검색 결과 표시·선택 추가, 직접 입력·곡 목록·삭제. 검색 상태는 임시 UI 상태. |
| `src/services/musicSearch.ts` | iTunes HTTP GET 요청과 JSON 응답의 공통 검색 결과 변환. |
| `src/types/musicSearch.ts` | `MusicSearchResult`: externalId·title·artist, optional albumImageUrl·releaseDate. |
| `src/types/era.ts` | `Era`, `EraFormValues` 공용 타입. |
| `src/utils/date.ts` | `monthToIndex`, 로컬 날짜를 월 문자열로 만드는 `formatMonth`. |
| `src/utils/era.ts` | `createSchoolEras`, `assignEraLanes`와 내부 결과 타입. |
| `src/main.tsx` | 공통 CSS를 불러오고 `StrictMode` 안에서 App을 렌더링한다. |
| `src/index.css` | 기본 폰트·여백·색상·box sizing 등 공통 스타일. |
| `src/styles/*.css` | 온보딩, 타임라인·상세, 모달 스타일. |
| `index.html` | `#root`, 진입 스크립트, 제목·파비콘. 현재 `lang="en"`. |
| `vite.config.ts` | React 플러그인을 적용하는 기본 Vite 설정. |
| `tsconfig*.json` | 앱과 Vite 설정 코드의 TypeScript 검사 범위·옵션. |
| `eslint.config.js` | TypeScript·Hooks·React Refresh 권장 규칙. |
| `README.md` | v0.1 소개·실행 방법·검색 기능·Live Demo 안내. |

`components/`, `types/`, `utils/` 분리를 완료했다. 테스트·서버 구조는 아직 없다. `src/assets/`의 파일들과 `public/icons.svg`는 현재 앱에서 참조하지 않는다. `public/favicon.svg`는 사용한다.

## 4. 기술 스택과 실행 명령

다음 버전은 확인일의 **package.json 선언 범위**다. 이후에는 실제 파일을 다시 확인한다. 정확한 잠금 버전과 전이 의존성은 `package-lock.json`에 기록된다.

| 용도 | 현재 선언 |
| --- | --- |
| 런타임 | `react`, `react-dom`: `^19.2.8` |
| 빌드 | `vite`: `^8.3.0`, `@vitejs/plugin-react`: `^6.1.1` |
| 타입 검사 | `typescript`: `~6.0.2` |
| 린트 | `eslint`: `^10.10.0`, `@eslint/js`: `^10.0.1`, `typescript-eslint`: `^8.69.0` |
| React 검사 | `eslint-plugin-react-hooks`: `^7.1.1`, `eslint-plugin-react-refresh`: `^0.5.6` |
| 타입·전역 정의 | `@types/node`: `^24.13.3`, `@types/react`: `^19.2.18`, `@types/react-dom`: `^19.2.7`, `globals`: `^17.12.0` |

일반 CSS와 `useState`를 사용한다. React Router, 별도 상태관리 도구, UI 라이브러리, 테스트 프레임워크는 없다. 앱 TypeScript 설정은 ES2023, `noEmit`, 미사용 변수·매개변수 검사를 사용한다.

| 명령 | 의미 |
| --- | --- |
| `npm run dev` | Vite 개발 서버 |
| `npm run lint` | ESLint 검사 |
| `npm run build` | `tsc -b && vite build`: 타입 검사 후 배포용 빌드 |
| `npm run preview` | 빌드 결과 로컬 확인 |

별도 `typecheck` 또는 `test` npm 스크립트는 없다. 산출물 없이 타입만 확인하려면 설치된 TypeScript로 다음 명령을 사용할 수 있다.

```text
node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit --incremental false
node node_modules/typescript/bin/tsc -p tsconfig.node.json --noEmit --incremental false
```

## 5. 기술 부채와 확인할 경계 조건

| 항목 | 현재 근거 | 대응 시점 |
| --- | --- | --- |
| App 책임 집중 | 컴포넌트·타입·유틸리티 분리로 129줄의 화면 연결·공유 상태 관리로 정리 | 해결: 이번 리팩터링 |
| 폼 초기화 반복 | 모달의 마운트 시 초기화와 언마운트로 App의 반복 초기화 제거 | 해결: 이번 리팩터링 |
| 공백 이름 | 빈 문자열만 검사해 공백만 있는 이름은 허용 | 폼 검증 개선 |
| 접근성 | 모달 역할·제목 연결, 포커스 이동·복원·가두기, Escape 닫기 미구현 | Era 기반 안정화 |
| 모바일 대응 | 헤더 가로 배치, 40px 여백, 모달 높이·스크롤 제한 없음 | 실제 작은 화면에서 확인 후 개선 |
| 짧은 Era | 한 달 계산 너비 8px에 비해 좌우 패딩 합계 16px와 border가 큼 | 표시·클릭 영역을 실제 화면에서 검토 |
| 첫 연도 눈금 | 첫 눈금에 `translateX(-50%)` 적용 | 왼쪽 잘림 여부를 브라우저에서 확인 |
| 진행 중 학교 기간 | 생성 시 현재 월을 종료값으로 저장할 뿐 자동 연장 상태 없음 | 저장·복원 구현 전 정책 검토 |
| 지속성 | localStorage 저장·복원 구현 | Phase 2 완료 |
| 계산 테스트 없음 | 날짜·학교 생성·겹침 배치 테스트 없음 | 분리 후 필요한 경계 조건 중심 검토 |
| 기본 템플릿 잔재 | 기본 README, 미사용 에셋, 한국어 UI와 HTML 언어 불일치 | 별도 작은 정리 작업 |

이번 리팩터링은 기존 문구·검증·날짜 규칙·DOM 구조를 유지하도록 코드를 이동했으며 CSS와 의존성은 변경하지 않았다. 검증 강화·접근성·디자인 개선은 별도 작업으로 남긴다. 검토 후보를 이번 문서 갱신에서 구현하지 않는다.

## 6. App 리팩터링 결과와 다음 작업 후보

**상태: 구현 완료.** 사용자 승인 후 컴포넌트·타입·계산의 역할 분리를 수행했다. 자동 검사와 확인한 브라우저 흐름은 9절에 명시한다.

컴포넌트 4개, Era 타입 파일 1개, 유틸리티 파일 2개를 추가했다. 현재 규모에 필요한 경계만 나눴으며 버튼·연도 눈금 등은 별도 컴포넌트로 쪼개지 않았다.

| 추가 파일 | 분리한 역할 |
| --- | --- |
| `components/Onboarding.tsx` | 출생연도 입력 상태·검증·화면. 확정된 연도를 App에 전달. |
| `components/Timeline.tsx` | 연도·막대·스크롤 표시와 표시용 좌표·크기 계산. 선택 ID를 App에 전달. |
| `components/EraDetail.tsx` | 선택 Era 정보와 수정 요청. 향후 음악 목록 확장 위치. |
| `components/EraModal.tsx` | 생성·수정 임시 입력과 검증. 저장할 값을 App에 전달. |
| `types/era.ts` | 공용 Era 타입과 실제 필요한 폼 입력 타입. |
| `utils/date.ts` | 월 인덱스 변환, 월 표기 등 독립 계산. |
| `utils/era.ts` | 학교 Era 생성과 lane 배치. |

App에는 프로필·Era 배열·선택/수정 ID·모달 표시 상태, 데이터 생성·수정과 화면 연결을 남겼다. 입력값은 해당 폼에 두고 선택된 Era나 좌표 같은 파생값을 중복 상태로 저장하지 않는다. CSS import도 기존처럼 App에 유지했다.

타입·유틸리티를 먼저 분리하고 화면 컴포넌트를 연결했다. Context·Redux·Zustand·새 라이브러리는 추가하지 않았다. 학습 포인트는 props/콜백, 상태 위치, 파생 데이터, 불변성, 순수 함수, 폼의 임시 상태와 마운트/언마운트다.

다음 작업은 아직 선택하지 않았다. Era 삭제는 작은 관리 기능 완성, 폼 검증·모바일 확인은 현재 사용성 보완, localStorage 저장·복원은 지속성 확보에 해당한다. 각각 별도 작은 작업으로 진행하며 리팩터링 완료를 이유로 자동 착수하지 않는다. 다음 기능 전에 현재 변경의 commit/push 시점을 안내하되 실제 실행은 사용자 요청에 따른다.

## 7. 단계별 개발 계획

순서는 고정 명령이 아니다. 핵심 경험을 검증하는 데 필요한 최소 범위로 진행하며, 한 기능을 완료·검증하고 commit/push 시점을 안내한 뒤 다음 기능으로 넘어간다.

| 단계 | 상태 | 작업 및 완료 기준 |
| --- | --- | --- |
| Phase 1 — Era 기반 안정화 | 일부 완료 / 나머지 예정 | 생성·선택·수정·Timeline과 App 구조·타입·util 분리 완료. Era 삭제, 폼 검증 개선, 모바일·반응형 검증은 남아 있음. |
| Phase 2 — 지속성 | 완료 | 프로필·Era·Track·관계를 단일 JSON으로 저장·복원. 누락/잘못된 값과 저장 예외 처리. 임시 UI 상태·migration·버전 관리는 제외. |
| Phase 3 — 음악 Archive 기반 | 일부 완료 | v0.1 최소 Track·EraTrack, Era별 수동 곡 추가·목록·삭제 완료. 기존 Track을 여러 Era에 연결하는 UI는 미구현. 미사용 관계 metadata는 추가하지 않음. |
| Phase 4 — Seed | 현재 범위 완료 | 기존 Era 곡·검색·직접 입력 후보, 선택·해제, 최소 정확히 5곡 확정, 최대 제한 없음. 완료 시 Era 내 중복 없이 Archive 저장 후 상세 복귀. 역사적 인기곡 공급은 미결정·미구현. |
| Phase 5 — Memory Reconstruction | 예정 | 약 30곡을 함께 탐색하는 밀도 높은 목록/표, 아티스트 이름 오름차순·그룹화 없음. 평가 상태/아이콘과 범례, 선택 항목의 세 액션. `RecommendationFeedback { eraId, trackId, status }`로 Era별 반응 기록, 미평가에는 레코드 미생성. 추천 더 보기와 같은 Era의 평가곡 제외. 발매 시기만으로 후보를 제한하지 않음. |
| Phase 6 — Unassigned | 예정 | 별도 UnassignedTrack 모델과 보관함, Era 선택·재배정과 여러 Era 저장. `sourceEraId`는 발견 맥락 Candidate이며 청취 Era가 아님. 중복·여러 출처·배정 후 잔류/삭제·저장 세부사항은 결정 후 구현. |
| Phase 7 — Playlist / Archive 경험 | 예정 | 내부 Era Playlist, Life Timeline→음악 기록 탐색, 전체 기억 복원 경험 연결. |

Phase 5의 `UNASSIGNED` 선택에는 최소 보관 처리가 필요하므로 Phase 6 일부를 앞당길 수 있다. 시절 미정 선택을 유실시키는 중간 구현을 만들지 않도록 해당 기능 시작 시 범위를 정한다. 전체 Unassigned 화면은 이후 확장할 수 있다.

지원용 v0.1의 기본 곡 검색은 iTunes Search API로 선행 구현했다. 이는 Seed·추천 시스템 구현 완료를 뜻하지 않으며 기존 Phase 순서와 장기 우선순위를 바꾸지 않는다. 당시 인기곡·추천용 데이터 공급과 초기 검증 방식은 [DECISIONS](DECISIONS.md)의 O-03에서 결정한다. 샘플 후보를 실제 개인 청취 이력이나 검증된 과거 차트로 제시해서는 안 된다.

추천은 Seed와 사용자 피드백을 우선한다. 같은 아티스트·비슷한 장르·당시 연령/생활 단계·국가/시장은 Candidate recommendation signals이며 Phase 5의 필수 알고리즘이나 선제 수집 필드로 확정하지 않는다. 추천은 한 곡씩 넘기는 UI가 아니며, 각 항목의 앨범 이미지·제목·아티스트·발매 시기·평가 상태를 목록에서 확인하는 방향이다. 별도 정렬 선택 기능은 현재 범위에 추가하지 않는다.

### Later

v0.1 기본 검색을 넘어서는 외부 음악 API 확장, Spotify·Apple Music 등 정식 서비스 연동·내보내기·과거 기록 가져오기, 서버·Supabase·로그인·계정, 공유·소셜, 통계·추천 알고리즘 고도화, 비슷한 사용자들의 선택 기반 추천/collaborative filtering, Moment/Event, 모바일 앱. 좋아하는 곡의 장르 자동분류, Era별 장르 통계·취향 변화도 핵심 복원 경험보다 뒤에 둔다. `primaryGenre` 사용은 자동분류 시스템 구현을 뜻하지 않는다.

## 8. 제공된 설명과 실제 코드의 차이

큰 불일치는 없다. 다음 표현은 실제 코드에 맞춰 구체화했다.

- 초기 확인 때 App은 725줄이었고 현재 리팩터링 후 129줄이다. 원래 기능은 새 컴포넌트·유틸리티로 분리했다.
- ‘출생 시점부터’는 실제로 출생연도 1월부터다. 출생 월·일은 받지 않는다.
- ‘진행 중인 학교 과정은 현재까지’는 생성 당시 월로 잘라 저장하는 방식이다. 시간 경과 후 자동 연장·복원 처리는 없다.
- 학교 Era 수정은 해당 항목만 바꾼다. 이후 학교 Era 이동 확인은 후보 UX이며 구현되어 있지 않다.
- 반응형 웹은 제품 방향이다. 현재 CSS만으로 모바일 사용성 검증 완료를 의미하지 않는다.
- 위 리팩터링 검증 당시에는 Track·Seed·추천·Unassigned·Playlist와 저장 기능이 모두 제품 계획이었다. 이후 v0.1 곡 기능은 아래 기록을 따른다.

### 2026-09-29 — 지원용 v0.1 Era별 곡 관리

- 구현: 제목·아티스트 수동 입력, 앞뒤 공백 제거, 빈 값/공백만 입력 차단, 추가 후 입력 초기화, Era별 목록과 삭제. 목록은 아티스트 오름차순이다.
- `src/types/track.ts`: 최소 Track과 EraTrack. App에 공유 음악 상태와 추가·삭제 콜백을 두고 EraDetail을 통해 전달한다. `src/components/EraTracks.tsx`는 폼·목록을 담당하며 Era 변경 시 key로 임시 입력을 초기화한다. 기존 폴더 구조에 이 두 파일만 추가했다.
- 메모리 상태만 사용한다. 동일 Track을 다른 Era도 참조하면 해당 Track은 보존한다. 수동 입력은 매번 새 Track을 생성하며 기존 곡 재사용 UI는 없다.
- 검증: 타입 검사를 포함한 build, lint 통과. 브라우저에서 두 Era 곡 추가·재선택·목록 분리·삭제, 제목/아티스트 각각 빈 값과 공백 차단, 입력 초기화, 온보딩·Era 생성·이름 수정 후 곡 유지 확인.
- 저장·API·추천·새 패키지는 추가하지 않았다. 새로고침 지속성은 검증 대상에서 제외했다. commit/push는 수행하지 않았다.

## 9. 검증 및 기록 운영

2026-09-22 초기 문서 생성 당시에는 소스, 스타일, 설정, package 선언·lockfile의 루트 선언, Git 상태와 파일 목록을 읽어 대조했다. 당시에는 기존 추적 파일 변경 없이 문서 4개만 추가했고 TypeScript·ESLint·build·브라우저 검증을 실행하지 않았다. 이후 코드 리팩터링에서 수행한 검증은 아래에 별도로 기록한다. 현재 문서 갱신에서는 분리된 실제 코드·진행 상태와 문서 링크·코드 블록을 확인했으며 기능 코드 수정이나 앱 검사 재실행은 하지 않았다.

이후 기능 변경은 현재 코드 확인 → Product Spec 비교 → 수정 파일·큰 변경 계획 설명 → 구현 → TypeScript → ESLint → 가능하면 build → 필요한 실제 사용자 흐름 확인 → 결과·핵심 개념 설명 → 관련 문서 갱신 순서로 진행한다. 수행하지 못한 검증은 명시한다.

### 2026-09-22 리팩터링 검증 기록

아래는 앞선 코드 리팩터링 작업에서 실제 수행한 검증이다. 이번 문서 갱신에서 검사를 새로 실행한 것은 아니다.

| 검증 | 결과와 범위 |
| --- | --- |
| TypeScript | 앱 대상 `tsc -p tsconfig.app.json --noEmit --incremental false` 통과. 최종 `npm run build`의 `tsc -b`도 통과. |
| ESLint | `npm run lint` 통과. |
| 빌드 | `npm run build`의 Vite 프로덕션 빌드 통과. |
| 브라우저 온보딩 | 빈 입력의 시작 버튼 비활성화, 2004년 입력 후 초·중·고 Era 생성과 상세 기간 확인. |
| 브라우저 수정·취소 | 학교 Era 수정 모달 초기값, 입력 후 취소 시 원본 유지, 재진입 시 기존 값 복원, 이름·설명 저장 후 상세 갱신 확인. |
| 브라우저 생성·배치 | 새 모달의 빈 입력값, 학교 Era와 겹치는 사용자 Era 생성·선택·상세 및 다른 lane 표시 확인. |
| 브라우저 기간 검증 | 종료 월을 시작 월보다 앞서게 입력할 때 기존 경고 표시와 저장 차단, 원본 상세 유지 확인. |
| 변경 범위 | CSS, `main.tsx`, `index.css`, `package.json`, lockfile 변경 없음. 새로운 의존성 없음. |

모든 화면 크기·가로/세로 스크롤 조작, 모든 날짜 경계와 입력 오류, 수정 전후 화면의 픽셀 단위 비교를 검증한 것은 아니다. 자동화된 회귀 테스트 파일도 추가하지 않았다. 확인한 흐름의 결과를 전체 동작 보장으로 확대하지 않는다.

Notion은 선택적 개발 기록 수단이다. 자동 관리하지 않는다. 기록 요청이 있다면 같은 날짜에 작은 기록을 여러 개 만들기보다 하루 종합 기록 하나와 최종 반영 시각을 선호한다. Codex 개발의 직접적인 기준은 repository 문서다.

### 2026-09-29 — localStorage 저장·복원

- `src/utils/storage.ts` 추가: 키 `music-archive-data`, 구조 `{ userProfile, eras, music: { tracks, eraTracks } }`. UserProfile 타입은 App과 유틸리티에서 공유한다.
- App은 lazy state 초기화로 복원하고 `useEffect`로 확정 데이터 변경을 저장한다. 선택 Era·모달·입력값은 저장하지 않는다. 학교 Era 기간은 저장된 값 그대로 유지한다.
- 누락 목록은 빈 배열, 유효하지 않은 항목·없는 Era/Track을 가리키는 관계는 제외한다. 프로필이 유효하지 않거나 JSON/읽기에 실패하면 초기 화면으로 시작한다. 유효한 프로필이 없을 때는 저장을 건너뛰며, 쓰기 실패는 콘솔 경고 후 메모리 동작을 유지한다.
- 검증: lint와 타입 검사 포함 build 통과. 별도 로컬 테스트 주소에서 빈 상태 → 온보딩 → 사용자 Era → 곡 2개 → 새로고침 복원 → 곡 1개 삭제 → 새로고침 → Era 이름·설명 수정 → 새로고침 유지까지 브라우저 확인. 선택 상태가 복원되지 않는 것도 확인.
- 저장 유틸리티 검사: 빈 값, 손상 JSON, 누락 필드, 잘못된 항목, 끊어진 관계, 저장/복원 왕복, 읽기·쓰기 예외 통과. 실제 브라우저 용량 초과·저장 권한 차단은 재현하지 않았다.
- 새 패키지·UI 변경·commit/push 없음.

### 2026-09-29 — 지원용 v0.1 음악 검색 구현 반영

- `searchMusic(query)`는 `URLSearchParams`로 `term`, `media=music`, `entity=song`, `limit=10`을 구성해 iTunes Search API에 HTTP GET 요청한다. country·인증·새 패키지는 추가하지 않았다. `response.ok`와 JSON 구조를 검사한다.
- `trackId` → 문자열 `externalId`, `trackName` → `title`, `artistName` → `artist`로 변환한다. EraTracks는 공통 결과만 사용하며 검색 전·중·결과 있음·없음·실패를 표시한다. 빈 검색어는 요청하지 않는다.
- 검색 선택과 직접 입력 모두 기존 `onAdd(title, artist)` → App의 `handleAddTrack`을 사용한다. 내부 ID는 `crypto.randomUUID()`이며 externalId는 Track/localStorage에 저장하지 않는다. 검색어·결과·상태도 저장하지 않는다.
- 기본 Timeline은 구현되어 있으며 Seed·추천·Unassigned·Life Timeline의 추가 확장과 정식 서비스 계정 연동은 향후 계획으로 유지한다. [Live Demo](https://music-archive-cyan.vercel.app/)는 사용자와 README의 배포 완료 정보를 반영했다.
- 이번 작업은 관련 코드·README와 문서 상태를 대조한 문서 갱신이다. 배포 사이트 실행이나 앱 테스트는 재수행하지 않았다.

### Phase 4 — Seed Selection 구현·검증

- 기준: 원격 main과 로컬 `89cbf00` 일치, 작업 시작 시 변경 없음 확인.
- SeedSelection은 Era 맥락·선택 목록·기존 곡·검색·직접 입력 후보를 제공한다. 최소 정확히 5곡, 최대 제한 없음. 선택 중에는 Archive를 변경하지 않으며 뒤로 가면 폐기한다.
- App은 화면 상태와 임시 `{ eraId, trackIds }` 세션을 관리한다. Seed 완료 시 addTracksToEra로 Era 내 trim·대소문자 무시 title + artist 중복을 검사하고 기존 ID 재사용 또는 새 UUID 생성 후 상세로 돌아간다. 이 공통 함수는 일반 검색·직접 입력 추가에서도 사용한다. 다른 Era 곡은 자동 병합하지 않는다.
- MusicSearch는 기존 검색을 재사용하도록 분리했다. TrackSummary는 optional 이미지·발매연도를 표시하며 이미지 없음/실패는 placeholder로 처리한다. TrackInput을 사용해 추가 콜백에 metadata를 전달한다. createTrack은 externalId를 복사하지 않는다.
- storage는 metadata 없는 기존 Track도 복원한다. 유효한 optional metadata는 유지하고 잘못된 값은 생략한다. 기존 키·JSON 최상위 구조는 유지한다. 세션·초안·검색 결과는 저장하지 않는다.
- lint와 타입 검사 포함 build 통과. 유틸리티 검사에서 같은 Era 중복 재사용, 전역 비병합, UUID, 입력 불변, externalId 미저장, metadata 변환·저장 왕복과 구형 Track 호환 확인.
- 브라우저: 온보딩·학교 Era·Custom Era 생성/수정·기존 직접 입력·검색 추가/삭제 유지 확인. Seed 진입과 Era 맥락, 기존 곡 자동 미선택, 실제 BTS 검색·이미지·발매연도, 직접 입력 후보, 4/5곡 및 해제 경계, 취소 후 새로고침 미저장, 재진입·확정·중복 없이 재확정, 6곡 확정, 새로고침 후 곡·metadata 복원 및 세션 초기화 확인. 390px 화면 가로 넘침 없음 확인.
- 한계: 모든 모바일 기기·브라우저, 실제 이미지 서버 실패·API 장애·저장 용량 초과는 이번 브라우저 검증에서 재현하지 않았다. 영구 Seed 모델·역사적 인기곡·추천·Feedback·Unassigned는 추가하지 않았다. commit/push 없음.

### 2026-09-30 — Phase 4 마무리 검증과 문서 보완

- 기존 미커밋 구현을 유지했다. EraTracks·SeedSelection의 검색 우선 UX, 검색 완료 후 직접 입력 fallback, 공통 addTracksToEra를 확인했다. 이번 재개 작업에서는 기능 코드를 추가 수정하지 않았다.
- isTrackAvailableForEra는 유효한 원본 발매 YYYY-MM이 Era 종료 월 이후인 곡만 제외한다. 종료 월·시작 이전 곡·결측/판별 불가 날짜는 허용한다. 검색 결과와 기존 Seed 후보에 적용하고 저장 직전에도 검사한다. 기존 Archive를 소급 삭제하지 않는다. 추천 방향의 ‘발매 시기만으로 제한하지 않음’은 과거 곡을 허용한다는 뜻이며 알려진 미래 곡을 포함한다는 뜻이 아니다.
- service에서 후보 50개를 한 번 조회하고 MusicSearch에서 필터 후 최대 10개를 표시한다. 필터 전 10개 제한으로 결과가 줄어드는 현상을 완화하되 충분한 후보가 없으면 10개 미만일 수 있다. pagination·자동 추가 요청 없음.
- 브라우저: 두 화면의 검색 전 직접 입력 숨김, 실제 BTS 검색 결과가 있어도 fallback 펼치기, 빈 검색 결과의 fallback, 검색 반복 추가 및 공백·대소문자 차이 직접 입력 중복 방지, 발매연도 없는 직접 입력 곡과 검색 곡 새로고침 복원 확인. Era 시작 이전 곡 표시, Seed 기존 곡 자동 미선택, 4곡 완료 차단·5곡 확정·재확정 후 5곡 유지, 취소 후 선택 초기화를 확인했다.
- 별도 유틸리티 실행 검사: 종료 월/다음 월 경계, 과거 곡, 날짜 결측·잘못된 날짜, 시차에 따른 월 변경 방지, 같은 Era 기존 ID 재사용, 다른 Era 비병합, 저장 단계 미래 곡 차단, 구형 Track·optional metadata·손상 JSON 복원 처리 통과.
- 재개 작업 마지막에 npm run lint와 npm run build(TypeScript 검사 포함)를 다시 실행해 모두 통과했다. commit/push는 하지 않았다.
- 검증 한계: 날짜 경계와 잘못된 metadata는 실제 API 브라우저 데이터로 강제 재현하지 않았다. API 장애·저장 용량 초과·모든 기기 검증은 하지 않았다. 기존 저장 중복을 정리하는 migration은 범위 밖이다.
- 후속 UI 방향만 기록: 세로형 UI는 핵심 기능 검증용 임시 구조다. Seed·Memory Reconstruction 흐름 정착 후 데스크톱을 좌측 Era 탐색/내비게이션과 우측 음악 작업 영역으로 구조화한다. Phase 4 레이아웃 리팩터링은 하지 않는다.

### 2026-09-30 — Phase 4 중복 안내 UX 보완

- EraTracks가 sameSong으로 현재 Era 저장 여부를 계산해 MusicSearch의 optional isAdded로 전달한다. 검색 결과는 유지하고 “추가됨” 버튼만 비활성화한다. 직접 입력 중복 제출에는 작은 inline 메시지를 표시하며 입력 변경 시 해제한다.
- SeedSelection은 기존 isSelected에 따른 “선택/선택됨”과 선택·해제를 유지한다. addTracksToEra·발매월 필터·저장 구조는 변경하지 않았다.
- 브라우저에서 기존 곡 “추가됨” 비활성화, 공백·대소문자 차이 중복 입력 안내 및 수정 시 해제, 기존 Archive 곡의 Seed 선택·해제를 확인했다. 필터 후 4곡만 남는 실제 검색에서 목록 4개와 “검색 결과 4곡” 안내가 일치했다.
- npm run lint와 npm run build(TypeScript 검사 포함) 통과. 이번에는 API 장애·전체 저장 복원 회귀 검증을 반복하지 않았다. commit/push 없음.

### 2026-09-30 — EraTracks 검색 순서 보완

- 기존 월 필터·최대 10곡 제한 후, 표시 대상 안에서 sameSong 기반 isAdded를 사용해 미추가 곡을 우선 배치한다. 그룹 내부 API 순서와 추가된 곡의 비활성 “추가됨” 표시는 유지한다. Seed 검색 순서는 변경하지 않는다.
- 추가 검색 탐색/더 보기는 추후 개선 사항이며 요청 수·표시 개수를 확대하지 않았다. lint·TypeScript 포함 build 통과. 이번 작은 정렬 변경은 브라우저에서 재검증하지 않았다. commit/push 없음.
