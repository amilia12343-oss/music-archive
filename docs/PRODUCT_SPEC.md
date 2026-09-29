# Music Archive — Product Spec

최종 정리: 2026-09-22

이 문서는 서비스의 최신 제품 방향을 정의한다. 구현 현황은 [ROADMAP](ROADMAP.md), 결정 이유와 변경 이력은 [DECISIONS](DECISIONS.md)를 참고한다. 아래 사양이 모두 구현되어 있다는 뜻은 아니다.

## 1. 상태와 문서 기준

| 구분 | 의미 |
| --- | --- |
| Confirmed / Current Direction | 사용자가 명시한 제품 원칙 또는 현재 추진 방향. 구현 완료 여부는 ROADMAP에서 별도로 관리한다. |
| Candidate / Needs Decision | 검토할 아이디어 또는 미확정 세부 동작. 확정 요구처럼 임의 구현하지 않는다. |
| Later / Out of MVP | 장기 확장 후보. 현재 MVP를 위해 미리 코드나 데이터 모델을 만들지 않는다. |
| Superseded / Historical Alternative | 현재 방향으로 대체된 과거 대안. 구체적인 내용은 DECISIONS에만 보존하며 현재 요구로 구현하지 않는다. |

제품 방향은 이 문서가 기준이며, 실제 구현과 기술 버전은 코드·`package.json`이 기준이다. 충돌하면 차이를 먼저 알린다. 과거 아이디어보다 최신 명시적 결정을 우선하며, 결정 변경 과정은 DECISIONS에 남긴다.

## 2. 문제와 제품 목표

Music Archive는 개인 포트폴리오용 실제 웹 서비스이자 React·TypeScript 학습 프로젝트다. 개발자가 코드와 설계 이유를 이해하며 점진적으로 완성한다.

사용자는 스트리밍 서비스를 늦게 시작했거나, Spotify·Apple Music 등 서비스를 옮겼거나, 오래된 서비스의 기록을 잃어 인생 전체의 청취 이력을 갖고 있지 않을 수 있다. 일부 기록이 있어도 “중학생 때 무슨 음악을 들었지?”에 답하기 어렵다.

핵심 목표는 **기록이 없는 과거의 음악 기억을 사용자의 기억과 추천 후보를 통해 복원하는 것**이다. 단순 플레이리스트 관리나 음악 통계가 중심은 아니다. 서비스가 과거 청취 사실을 추측해 확정해서는 안 된다.

추천은 “이 시기에 이런 곡을 들었을 가능성이 있는데 기억나는가?”라는 질문이다. 최종 Era Archive에는 사용자가 해당 시기에 들었다고 직접 확인한 음악만 저장한다.

### 핵심 흐름 — Confirmed / Current Direction

`Remember → Reconstruct → Archive → Playlist`

1. **Remember:** 사용자가 인생의 특정 시기인 Era를 떠올린다.
2. **Reconstruct:** 기억나는 대표곡과 추천 후보로 음악 기억을 복원한다.
3. **Archive:** 해당 Era에서 들었다고 사용자가 확인한 곡을 저장한다.
4. **Playlist:** 복원한 음악으로 개인 Era Playlist를 완성한다.

여러 Era가 모이면 전체 음악 인생 타임라인이 된다. 장기적으로 과거 기록, 기억 복원, Era Archive, Playlist, Life Timeline을 연결한다.

## 3. 플랫폼과 MVP 구현 방향

### Confirmed / Current Direction

- 최신 플랫폼 결정은 **웹 MVP**다. 모바일 앱은 현재 범위에서 제외한다.
- 데스크톱뿐 아니라 모바일에서도 사용하기 편한 반응형 웹을 지향한다.
- React + TypeScript + Vite + 일반 CSS를 사용한다. 버전은 `package.json`과 실제 코드로 확인한다.
- 초기 MVP는 서버 없이 핵심 사용자 경험을 검증한다. 서버·로그인·사용자 계정을 먼저 만들지 않는다.
- 지원용 v0.1은 `music-archive-data` localStorage 키에 프로필·Era·Track·EraTrack을 하나의 JSON 객체로 저장하고 앱 시작 시 복원한다. 임시 UI 상태는 저장하지 않으며 서버·마이그레이션·버전 관리는 구현하지 않는다.
- 현재 상태 관리는 React `useState` 중심이다. Redux, Zustand, 복잡한 Context를 선제 도입하지 않는다.
- React Router는 독립 화면·URL 탐색이 실제로 필요해지는 시점에 검토한다. 예상 화면이 있다는 이유만으로 즉시 설치하지 않는다.

Supabase 등 백엔드·DB와 모바일 앱은 Later다. 외부 음악 서비스 연동이 핵심 경험 검증보다 먼저 오지 않도록 한다.

## 4. Era와 Life Timeline

### Era — Confirmed / Current Direction

Era는 인생에서 비교적 긴 하나의 시기다. 기본 시간 단위는 월 `YYYY-MM`이다. 예: 초·중·고 시절, 아르바이트, 동아리, 특정 사람들과 자주 지낸 기간, 개인적으로 의미 있는 시기.

일반 Era는 학교 Era와도, 다른 일반 Era와도 겹칠 수 있다. 같은 기간의 고등학교·아르바이트·동아리 Era를 모두 표현할 수 있어야 한다. 타임라인은 이름 중심으로 간단히 표시하고 선택하면 상세 내용을 보여준다.

### 학교 Era — Confirmed / Current Direction

출생연도로 한국의 일반적인 학제를 기준으로 초등학교·중학교·고등학교 Era를 자동 생성한다. **대학교와 군대는 자동 생성하지 않는다.** 자동 생성된 학교 Era도 사용자가 수정할 수 있다.

현재 코드의 기본 계산식은 다음과 같다. `B`는 출생연도다.

| 과정 | 기본 시작 | 기본 종료 |
| --- | --- | --- |
| 초등학교 | `(B + 7)-03` | `(B + 13)-02` |
| 중학교 | `(B + 13)-03` | `(B + 16)-02` |
| 고등학교 | `(B + 16)-03` | `(B + 19)-02` |

- 아직 시작하지 않은 학교 과정은 생성하지 않는다.
- 진행 중인 과정은 생성 시 종료 월을 현재 월로 제한한다.
- 기본 자동 생성 결과의 학교 Era끼리는 겹치지 않는다. 현재 수정 기능은 학교 Era 간 겹침을 별도로 금지하지 않는다.
- 이 계산은 기본값이며 모든 사용자의 실제 학업 이력을 확정하는 규칙이 아니다.

### 학교 Era 예외 — Candidate / Needs Decision

유급·휴학과 유사한 예외로 중학교 기간을 늘리면 이후 고등학교 기간도 조정해야 할 수 있다. “이후 학교 Era도 함께 이동할까요?”라고 확인하는 UX를 고려한다. 무경고 자동 변경을 확정하지 않는다. 이동 대상·기준·연쇄 조정 방식은 미정이며 핵심 MVP보다 우선순위가 낮다. 현재 코드는 선택한 Era만 수정한다.

### 짧은 기억 — Later / Out of MVP

일주일 여행, 수학여행, 축제, 며칠간의 사건은 향후 `Moment` 또는 `Event`로 다루는 것을 고려한다. 음악과 연결할 수 있지만 Era에 억지로 포함하지 않는다. 현재 타입·기능을 미리 만들지 않는다.

### Life Timeline — Confirmed / Current Direction

출생부터 현재까지 여러 Era를 탐색하고 해당 음악 기록으로 진입하는 중심 UI다. 일정 관리가 목적은 아니다. 겹친 Era는 여러 lane에 배치한다.

Timeline UX의 현재 방향:

- 시간 단위는 월이며, 월마다 고정 폭을 사용하는 픽셀 기반 시간축을 사용한다.
- 긴 기간은 Timeline 내부 가로 스크롤로 탐색한다.
- Era가 많아지면 Timeline 내부 세로 스크롤로 탐색한다.
- 기간이 겹치는 Era는 여러 lane에 배치한다.
- Era 막대에는 기본적으로 이름 중심의 최소 정보만 표시한다.
- Era를 클릭하면 상세 정보를 확인한다.

월당 픽셀 수, lane 간격, 영역 높이의 정확한 숫자는 영구 제품 요구사항으로 고정하지 않는다. 현재 구현값은 ROADMAP에서 관리한다.

현재는 출생연도만 입력하므로 **출생연도 1월부터 현재 월까지** 표시한다. 실제 생일을 알고 표시하는 것이 아니다. 가로·세로 스크롤, 연도 눈금과 선택한 Era의 상세 영역이 구현되어 있다.

## 5. Era-first 흐름과 주요 화면

기본 흐름은 Era를 선택한 뒤 해당 시절의 음악을 복원하는 **Era-first UX**다.

`Life Timeline → Era 선택 → Era Detail → Seed 선택 → Memory Reconstruction → 사용자 확인 → Era Archive → Era Playlist`

| 예상 화면 | 제품 역할 | 현재 구현 여부 |
| --- | --- | --- |
| Home / Life Timeline | Era 탐색·선택·추가 | 타임라인 영역 구현. 독립 라우트는 없음. |
| Era Detail | Era 정보와 해당 시기 음악 Archive | 이름·기간·설명·수정, 제목·아티스트 수동 입력과 Era별 곡 목록·삭제 구현. localStorage 저장·복원, iTunes 기본 곡 검색·선택 추가 구현. |
| Seed Selection | 기억나는 대표곡 선택 | 기존 Era 곡·검색·직접 입력 후보 선택, 최소 5곡 확정 구현. 현재 완료 후 Era Detail 복귀. |
| Memory Reconstruction | 후보 음악에 대한 기억 확인 | 미구현 |
| Unassigned | 기억나지만 시절이 불명확한 곡 보관·배정 | 미구현 |

화면은 실제 필요에 맞춰 단계적으로 만든다. 모든 화면·라우트를 한 번에 구현하지 않는다.

데스크톱 레이아웃 — Current Direction, 후속 작업: 현재 세로형 UI는 핵심 기능 검증용 임시 구조다. 목표는 왼쪽 Era 탐색/내비게이션, 오른쪽 선택한 Era의 음악 작업 영역이다. Seed와 Memory Reconstruction 핵심 흐름이 자리 잡은 뒤 전체 레이아웃을 구조화하며, 이번 Phase 4에서는 레이아웃 리팩터링을 하지 않는다.

Era Detail과 Seed Selection은 검색을 우선한다. 직접 입력은 처음에는 숨기고, 검색 완료 후 결과 유무·실패 여부와 관계없이 “원하는 곡을 찾지 못했나요? 직접 추가하기”로 펼칠 수 있다. 직접 입력한 곡에는 발매일을 임의로 만들지 않는다.

Era Detail 검색에서 이미 현재 Era에 저장된 곡은 숨기지 않고 버튼을 “추가됨”으로 비활성화한다. 직접 입력 중복 제출에는 폼 근처에 “이미 이 시절에 추가된 곡입니다.”를 표시한다. Seed의 “선택/선택됨”은 현재 Seed 선택 상태이며 Archive 저장 여부로 선택을 막지 않는다. 데이터 계층의 중복 방지는 별도로 유지한다.

EraTracks 검색은 표시 대상 안에서 미추가 곡을 먼저, 추가된 곡을 뒤에 노출하며 각 그룹 안의 API 순서는 유지한다. Seed 검색에는 이 우선순위를 적용하지 않는다. 추가 검색 탐색/더 보기는 추후 개선 사항이다.

## 6. Seed Selection

### Confirmed / Current Direction

Seed는 특정 Era의 기억 복원에 사용하는 강한 초기 신호이며 **곡 중심**이다. 그 시절 많이 들은 곡, 인상 깊은 곡, 남들은 잘 모르지만 자신에게 중요한 ‘나만의 곡’을 사용자가 직접 선택한다. 이런 개인적인 선택을 추천에서 약하게 취급하지 않는다.

- 최소 **정확히 5곡**, 최대 제한 없음. 0~4곡은 완료 불가하며 5곡 이상일 때만 완료한다.
- 현재 후보는 기존 Era 곡·음악 검색·직접 입력한 나만의 곡이다. 기존 Era 곡은 자동 선택하지 않는다. 당시 인기곡 후보 방향은 유지하지만 신뢰할 데이터 공급 방식 결정 전 미구현이며, iTunes를 역사적 차트로 취급하거나 임의 인기곡을 만들지 않는다.
- 곡 제목, 아티스트, 앨범 이미지, 발매연도 또는 발매일과 **현재 복원 중인 Era에 관련된 시절 라벨/맥락**을 표시해 기억을 돕는다. 단순한 곡 정보 외에 “이 곡이 내 어느 시절과 관련된 후보인지” 이해할 수 있어야 한다. 이 맥락 표시는 실제 청취 사실의 확정을 뜻하지 않는다.
- MVP에서는 아티스트 자체를 별도의 Seed로 선택하는 기능을 제외한다.
- 선택·해제 및 직접 입력 후보는 임시 UI 상태다. 확정 전 Track·EraTrack·localStorage를 변경하지 않으며 뒤로 가면 버린다.
- 최종 완료는 해당 Era에서 들었다는 명시적 사용자 확인이다. 확정된 Seed는 기존 Track + EraTrack 흐름으로 Era Archive에도 저장한다. 같은 Era의 trim·대소문자 무시 title + artist가 일치하면 기존 ID를 재사용하고 다른 Era의 Track은 자동 병합하지 않는다.
- App의 임시 복원 세션은 `{ eraId, trackIds }`만 기억하며 localStorage에 저장하지 않는다. 별도 영구 Seed 모델은 만들지 않는다.
- 현재 완료 후 Era Detail로 돌아가는 연결은 Phase 5 이전의 임시 흐름이며 이후 Memory Reconstruction으로 연결할 예정이다.

### Candidate / Needs Decision

- 당시 인기곡의 신뢰 가능한 데이터 공급 방식. 현재 기본 검색은 iTunes API를 사용한다.
- 다른 Era를 포함한 전역 Track identity·동명이곡/다른 버전 판별은 별도 결정한다.

## 7. Memory Reconstruction / Recommendation

### Confirmed / Current Direction

사용자가 해당 Era에서 들었을 가능성이 있는 후보를 제시한다. Seed 기반 추천과 사용자 피드백을 통한 개선을 우선한다. Seed는 가장 중요한 신호 중 하나이며, 사용자의 개인적인 대표곡 의미를 강하게 반영한다.

추천에 조합할 수 있는 신호는 다음과 같다. 구체적인 알고리즘·가중치는 아직 결정하지 않았다.

1. Seed와 유사한 음악
2. 같은 시기에 발매된 음악
3. Era 당시 인기 있었던 음악
4. 해당 시기에도 자주 들렸던 과거 발매곡
5. 사용자의 이전 평가 결과

**Era 기간에 발매된 곡만 추천하지 않는다.** 예를 들어 2015년 Era에서 2010년 곡을 들었을 수 있다. 발매일은 하나의 신호이며 청취 시기를 대신하지 않는다.

Era 시작 이전 곡은 허용하되, 유효한 발매일의 월이 Era 종료 월 이후이면 후보에서 제외한다. 종료 월과 같은 월은 허용하며 발매일이 없거나 판별 불가하면 제외하지 않는다. 이 원칙은 현재 Era 검색·Seed 후보와 공통 추가 로직에 적용되어 있으며, 추천 시스템 자체는 아직 미구현이다.

추천 UI — Current Direction:

- 한 곡씩 넘기는 UI를 사용하지 않는다. **약 30곡을 한 화면에서 함께 탐색할 수 있는 밀도 높은 목록/표**를 사용한다. 정확한 후보 수와 세부 시각 디자인은 UX 테스트·구현 시 조정할 수 있다. 한 화면은 하나의 결과 목록을 뜻하며, 기기 높이에 따라 목록을 스크롤할 수 있다.
- 각 항목에는 최소한 **앨범 이미지, 곡 제목, 아티스트, 발매연도 또는 발매일, 평가 상태/상태 아이콘**을 표시한다.
- 기본 정렬은 **아티스트 이름 오름차순**이다. 아티스트별 그룹으로 묶지 않으며, 사용자가 별도 정렬 방식을 선택하는 기능은 현재 필요하지 않다.
- 결과 위에 평가 아이콘/상태의 의미를 설명하는 간단한 범례를 제공한다.
- 곡을 선택하면 해당 항목이 확장되거나 명확한 액션 영역을 보여주고 **들었어요 / 시절 미정 / 안 들었어요**를 선택할 수 있게 한다. 확장 형태 등 세부 디자인은 구현 시 조정한다.
- 기본 상태에서는 전체 결과를 빠르게 탐색할 수 있어야 한다. 선택한 평가 상태는 아이콘 등으로 목록에서 바로 구분되며, 곡을 열어야만 확인할 수 있는 정보로 숨기지 않는다.
- 이미 평가한 곡은 **같은 Era**의 다음 추천 목록에서 제외한다.
- `추천 더 보기`로 새로운 후보 목록을 제공한다.
- 다른 Era에서의 청취 가능성까지 일괄 부정하거나 제외하지 않는다.

### RecommendationFeedback — Confirmed / Current Direction, 미구현

**RecommendationFeedback 모델을 유지하는 것이 현재 방향**이다. 특정 추천 Track에 대해 사용자가 특정 Era에서 어떤 반응을 했는지 기억한다. 최소 관계 의미는 다음과 같으며 실제 TypeScript 타입이나 DB schema를 지금 추가하라는 뜻은 아니다.

```text
RecommendationFeedback {
  eraId
  trackId
  status
}
```

같은 Track도 Era가 다르면 서로 다른 Feedback을 가질 수 있다. 반응은 해당 Era와 Track의 조합에 관한 것이며 곡 전체에 대한 전역 평가가 아니다.

| 사용자 반응 | 개념적 상태 | 처리 원칙 |
| --- | --- | --- |
| 이 시절에 들었어요 / 들었어요 | `LISTENED` | 해당 Era 청취 확인. Era Archive에 저장. |
| 시절 미정 | `UNASSIGNED` | 곡은 기억나지만 Era가 불명확함. Unassigned에 저장. |
| 안 들었어요 | `NOT_LISTENED` | 해당 Era에서 듣지 않았다는 명시적 부정 신호. |
| 아무것도 선택하지 않음 | 미평가 | RecommendationFeedback을 생성하지 않는다. 부정 신호가 아니며 청취 여부를 추론하지 않는다. |

`NOT_LISTENED`만 명시적인 부정 신호다. `UNASSIGNED`는 ‘안 들음’이 아니며, 미선택도 ‘안 들음’이 아니다.

미평가 곡에는 RecommendationFeedback을 생성하지 않는 방향을 사용한다. 세 가지 명시적 status와 미평가의 구분은 현재 방향이며, 실제 타입의 추가 필드·별도 ID·timestamp·DB schema·persistence 구현 방식은 구현할 때 결정한다.

### Candidate / Needs Decision

- RecommendationFeedback의 구체적인 타입과 persistence 구현 세부사항. 모델의 유지, 세 가지 명시적 status, Era별 반응과 미평가 레코드 미생성 방향 자체는 미정이 아니다.
- 미평가 후보를 다음 목록에 언제 다시 노출할지, 명시적 평가의 수정·취소 방식.
- 추천 후보 수, 공급 방식, 신호 조합과 알고리즘. 불필요한 score·confidence·source metadata를 선제 설계하지 않는다.
- 추가 추천 신호 후보: **같은 아티스트, 비슷한 장르, 사용자의 당시 연령/생활 단계, 국가 또는 음악 시장**. 필수 MVP 알고리즘이나 프로필 필드로 확정하지 않는다. Seed와 사용자 피드백 우선 방향을 유지한다.

비슷한 사용자들의 선택을 활용하는 추천과 collaborative filtering은 Candidate MVP 신호에 포함하지 않고 Later로 둔다.

## 8. Archive와 Track

### Archive — Confirmed / Current Direction

추천 결과를 자동으로 사용자의 과거 청취 기록으로 확정하지 않는다. **해당 Era에서 들었다고 사용자가 직접 확인한 곡만** 그 Era Archive에 들어간다. 시스템의 추측과 사용자의 확인을 구분한다.

### 최소 Track 모델 — Current Direction, 일부 구현

현재 Track은 `id`, `title`, `artist`와 optional `albumImageUrl`, `releaseDate`를 구현한다. Seed의 기억 보조 정보로 이미지와 발매연도를 실제 사용한다. 메타데이터가 없는 기존 Track도 복원하며 이미지 누락·로드 실패에는 placeholder를 표시한다. `primaryGenre` 등 나머지 장기 필드는 미구현이다. 검색 추가·직접 입력·Seed 확정 모두 같은 Era의 title + artist를 trim·대소문자 무시 비교해 기존 ID를 재사용한다. 다른 Era와 전역 병합하거나 기존 저장 중복을 일괄 정리하지 않는다. MusicSearchResult도 같은 optional metadata를 가지며 externalId는 검색 전용이고 영구 저장하지 않는다.

음악 기능을 구현할 때 사용할 최소 모델 방향은 다음과 같다. 이 문서 작성만으로 타입을 코드에 추가하지 않는다.

```ts
type Track = {
  id: string
  title: string
  artist: string
  albumImageUrl: string
  releaseDate: string
  primaryGenre: string
}
```

실제 사용하는 정보만 저장한다. 다음 필드는 필요해질 때 검토하며 현재 미리 추가하지 않는다.

- `album`, Spotify URL, Apple Music URL, 여러 음악 서비스별 ID
- `popularity`, `chartRanking`, `memo`
- 불필요한 추천 metadata, 복잡한 다중 genre 구조

외부 서비스에 종속된 모델을 먼저 설계하지 않는다. 실제 데이터에서 발매일·이미지 등이 없을 때의 처리 방식은 구현 시 결정한다.

`primaryGenre`를 사용하는 것은 현재 장르 자동분류 시스템을 구현하라는 뜻이 아니다. 자동분류와 장르 통계/취향 변화는 핵심 기억 복원 경험 이후의 Later 아이디어다.

### Era ↔ Track / EraTrack — Confirmed / Current Direction, 일부 구현

지원용 v0.1은 `EraTrack { eraId, trackId }` 타입과 메모리 관계 목록을 사용한다. 해당 Era에서 삭제하면 그 관계를 제거한다. localStorage로 저장·복원한다. 동일 Track을 여러 Era에 연결하는 선택 UI는 아직 없다.

Track과 Era는 **다대다 관계**다. 한 Track은 여러 Era에 포함될 수 있고 한 Era에는 여러 Track이 포함될 수 있다. 중학교 때 듣던 곡을 대학 시절 다시 들었다면 두 Era에 모두 기록할 수 있다. 대학 Era는 사용자가 직접 만들 수 있으며 자동 생성 대상에서만 제외된다.

Track 자체의 정보와 ‘어떤 Era에 저장되었는가’를 분리하기 위해 **EraTrack 관계 모델을 사용하는 것이 현재 방향**이다. 단순한 가능성으로 두지 않는다. 최소 관계 의미는 다음과 같다.

```text
EraTrack {
  eraId
  trackId
}
```

구체적인 타입과 저장 방식은 실제 구현 시 가장 단순한 구조로 정한다. `addedFrom`, `memo`, `evidence`, 불필요한 recommendation metadata와 현재 기능에서 사용하지 않는 관계 metadata를 미리 추가하지 않는다. 실제 기능에서 필요해질 때만 검토한다.

### Era Detail 음악 목록 — Current Direction

장기적으로 해당 Era의 음악 목록이 상세 화면의 중심 콘텐츠가 된다. 탐색하기 쉬운 목록과 아티스트 이름 기준 정렬을 사용한다. 앨범별·장르별 그룹화를 하지 않으며 복잡한 음악 라이브러리 UI를 지향하지 않는다.

## 9. Unassigned

### Confirmed / Current Direction

곡은 기억나지만 어느 시절인지 확신하지 못할 때 사용하는 별도 보관함이다. **일반 Era가 아니므로 자체 기간이 없고 Era처럼 description을 가질 필요도 없다.**

이 곡들을 임시 보관하는 별도의 **UnassignedTrack 모델을 사용하는 것도 Current Direction**이다. UnassignedTrack은 일반 Era가 아니며 실제 청취 Era를 임의로 확정하지 않는다. 현재 기능과 모델은 모두 미구현이다. 세부 타입·저장 방식은 구현 시 정한다.

나중에 곡을 선택하고 Era 선택 UI/팝업을 통해 실제 Era에 배정한다. 한 곡을 여러 Era에 배정할 수 있어야 한다. 배정은 사용자가 해당 Era의 청취를 확인하는 흐름이어야 한다.

### Candidate / Needs Decision

발견한 추천 맥락을 남기기 위해 `sourceEraId`를 보관하는 방향을 고려한다. 예: 고등학교 Era 복원 중 발견한 곡을 시절 미정으로 저장했다면 고등학교 Era가 출처가 된다. 이는 실제 청취 Era를 확정하는 값이 아니다.

여러 추천 과정에서 같은 곡을 발견했을 때의 중복 처리, 여러 `sourceEraId`를 보관할지, 출처 Era 삭제 시 처리, 실제 Era 배정 후 보관함에서 제거할지 등은 Open Decision이다. `sourceEraId` 후보가 모든 모델에 출처 metadata를 추가하라는 뜻은 아니다.

## 10. Playlist

### Confirmed / Current Direction

복원된 음악으로 ‘중학교 시절 Playlist’, ‘고등학교 시절 Playlist’, ‘첫 아르바이트 시절 Playlist’ 같은 개인 플레이리스트를 완성한다. MVP에서는 Music Archive 내부의 Playlist 경험에 집중한다.

별도의 Playlist 저장 모델 필요 여부와 내부 화면 표현은 구현 시 결정한다. 현재 범위만으로 스트리밍 재생이나 외부 서비스 플레이리스트 생성을 요구하지 않는다.

## 11. MVP 범위와 이후 확장

MVP의 핵심 경로는 **Era 생성·관리 → Era 선택 → Seed 선택 → 추천을 통한 기억 복원 → 사용자 확인 → Era Archive → Era Playlist**다. Life Timeline은 이 흐름을 탐색하는 중심 UI다.

새 기능마다 “핵심 경험을 지금 검증하는 데 필요한가?”를 판단한다. 필요한 최소 기능만 단계적으로 구현한다. 단계별 현황과 순서는 [ROADMAP](ROADMAP.md)을 따른다.

지원용 v0.1에서는 2026-09-29 기준 기본 곡 검색을 iTunes Search API로 선행 구현했다. Era Detail에서 검색 결과의 제목·아티스트를 확인하고 선택한 곡을 현재 Era에 추가하며, 직접 입력과 같은 Track/localStorage 흐름을 사용한다. 외부 검색 ID는 영구 저장하지 않고 내부 UUID를 유지한다. 이는 정식 음악 서비스 계정 연동이나 추천 구현을 뜻하지 않는다. Seed 기반 추천·과거 기억 복원·Unassigned·Life Timeline 추가 확장은 향후 계획이며 기존 장기 방향을 유지한다.

### Later / Out of MVP

- Spotify·Apple Music·다른 음악 서비스 연동, 스트리밍 플레이리스트 생성·내보내기, 과거 청취 기록 가져오기
- v0.1 기본 검색을 넘어서는 외부 음악 API 및 정식 서비스 연동 확장. 인기곡·추천의 데이터 공급 방식은 별도 결정이 필요하며 초기 경험 검증보다 먼저 확장하지 않는다.
- 서버, Supabase 등 DB, 로그인, 사용자 계정
- Era Playlist 공유, 시절별 음악 카드, 친구와 음악 시절 비교, 소셜 기능
- 좋아하는 곡의 장르 자동분류, Era별 장르 통계·주요 장르, 시기별 취향 변화, 통계 고도화. 간단한 장르 통계도 핵심 MVP보다 우선하지 않으며 `primaryGenre`가 자동분류 구현을 요구하는 것은 아니다.
- 추천 알고리즘 고도화, 비슷한 사용자들의 선택을 활용하는 추천 / collaborative filtering
- 음악과 연결할 수 있는 Moment/Event
- 모바일 앱

장기 확장 가능성만을 이유로 미사용 코드·데이터 필드·아키텍처를 추가하지 않는다.
