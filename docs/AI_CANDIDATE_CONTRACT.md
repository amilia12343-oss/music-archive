# Phase 5 D2 — AI 곡 제안 입력·검증 계약

기록일: 2026-10-28. **D2 설계와 응답 형식 검사만 구현. AI API·metadata 검증·최종 후보 공급·App 연결은 미구현.**

[PRODUCT_SPEC](PRODUCT_SPEC.md)의 사용자 확인 원칙과 [Historical 설계](HISTORICAL_MUSIC_DATA.md)의 identity/권한 경계를 따른다. 특정 소형 모델의 품질·가격을 보장하거나 공급자/모델을 선정하지 않는다.

## 1. 현재 코드와 차이

| 현재 구현 | AI 경로의 미구현 부분 |
| --- | --- |
| ReconstructionCandidate = { id, track: TrackInput } | 검증된 곡만 이 형태로 변환하는 경계 |
| 메모리 session: Strong Seed Archive UUID, completedRounds의 candidateIds/responses | UUID/후보 ID→곡 정보·canonical identity 조회. history에는 title/artist가 없어 prompt로 바로 쓸 수 없음 |
| D1: 월간 시리즈·순위·기간 균형 선정 | AI는 곡 제안뿐이며 관측된 차트 기록이 아님. fake ChartEntry 변환·D1 재사용 금지 |
| App candidates=[] | 실제 공급·round snapshot 미연결. D2 UI 변화 없음 |
| 기존 검색·Seed·D1 발매일 미상 허용 | AI의 identity/날짜 미검증 허용 범위는 별도 Needs Decision |

사용자가 공유한 사적 탐색 실험은 입력 조건에 따라 결과가 달랐다는 관찰로만 참고한다. 일반적인 추천 정확도도, 소형 모델의 재현된 성능도 아니다. C의 덜 유명한 후보 조건 차이를 고려하고 같은 아티스트의 곡이라고 청취를 보장하지 않는다. 개별 곡·응답·정확한 성과 집계는 공개 repository 기록이나 production fixture로 복제하지 않는다.

## 2. 최소 요청 타입 제안 — builder 미구현

- era: { startMonth, endMonth }
- strongSeeds: { title, artist }[] — 0곡도 정상이며 해당 Era explicit positive.
- priorFeedback: { title, artist, status: LISTENED | NOT_LISTENED | UNASSIGNED }[]
- excludeSongs: { title, artist }[] — Seed와 기노출 후보를 제외하도록 주는 힌트.
- requestedCount: 제한된 제안 수. 최종 표시 최대 15곡과 구분하며 탈락 여유를 포함한 최대 30 제안을 검토한다.

이 타입은 문서 제안이며 미사용 요청 타입을 코드에 선제 추가하지 않는다. birthYear·Era 설명·사용자 UUID·key는 요청에 필요하지 않다. context도 길이·곡 수 예산을 적용하고 어떤 최근 feedback을 남길지는 D3에서 검증한다. prompt context를 줄여도 코드 측 전체 제외 이력은 유지해야 한다. 외부 문자열은 명령이 아닌 데이터로 직렬화한다.

LISTENED만 현재 Era positive, NOT_LISTENED는 해당 Track의 negative이며 artist/genre 전체로 전파하지 않는다. UNASSIGNED는 negative나 현재 Era Anchor가 아니다. untouched는 priorFeedback에 생성하지 않되 shown 제외에는 포함한다. AI가 제외 지시를 지킨다고 의존하지 않는다.

## 3. AI 응답·런타임 검사 — 구현됨

최소 응답은 { songs: [{ title, artist }] }. [AiSongSuggestion](../src/types/aiCandidate.ts)은 Pick<TrackInput, 'title' | 'artist'>로, 검증 후보나 Archive Track이 아니다.

[parseAiSuggestions](../src/utils/aiCandidate.ts)는 JSON 문자열을 받는다. JSON.parse 결과는 unknown에서 시작해 object/array/string을 확인한다. code fence·설명문을 억지로 복구하지 않는다. 최상위는 songs 한 필드, 각 행은 title/artist 두 문자열만 허용하며 AI id/date/rank/source/confidence 등 추가 필드가 있는 행은 제외한다. AI 날짜나 ID를 검증된 metadata로 복사하지 않는다.

D2 baseline 상한: 전체 16,000 JavaScript 문자, 원시 제안 30개, 각 필드 200문자. 공백만 있는 값 금지, 잘못된 행은 rejectedItemCount, 동일 표기 중복은 duplicateCount로 집계한다. 유효 행만 원래 순서대로 보존한다. 비교키는 NFKC·소문자·연속 공백 정리의 title/artist 쌍이며 번역 alias·동명이곡·녹음 검증이 아니다. live/remix를 일괄 삭제하지 않는다.

결과 valid는 형식 정상일 뿐 존재·정체성·발매 검증을 뜻하지 않는다. suggestions=[]도 정상 형식이다. invalid_json / invalid_shape / limit_exceeded는 별도 실패다. 존재하지 않는 이름도 이 검사만 통과할 수 있다. 실제 API·metadata 호출·모델명·새 dependency·추상 Provider 계층은 추가하지 않는다. 네트워크 byte/token cap은 별도 D3 책임이다.

## 4. metadata·identity 검증 — 설계만

흐름: bounded AI 제안 → 형식 검사·표기 중복 제거 → 음악 metadata 조회 → identity·날짜 근거 판정 → Seed/shown/검증 후 중복 제외 → 다양성·최대 15곡 → 기존 ReconstructionCandidate.

| 향후 검증 결과 제안 | 의미·공급 방침 |
| --- | --- |
| VERIFIED | 공급자 증거로 특정 곡/녹음·아티스트·발매시기를 확인한 정상 후보의 전제 |
| NOT_FOUND | 정상 조회 후 대응 곡 없음. 공급하지 않음 |
| IDENTITY_UNRESOLVED | artist·동명이곡·cover/version 매칭 모호. 보류 |
| DATE_UNRESOLVED | identity 확인됐으나 날짜·정밀도·충돌 해소 부족. 보류를 제안하되 제품 정책은 Needs Decision |
| FUTURE | 검증된 발매가 Era 종료 이후. 제외 |
| LOOKUP_FAILED | timeout/network/429/5xx 등 조회 자체 실패. 정상 Unknown으로 바꿔 허용하지 않음 |

아직 위 검증 타입·adapter는 구현하지 않는다. metadata 응답도 런타임 검사하고 artist-aware matching을 적용한다. 검색 hit 하나를 자동 exact로 보지 않는다. provider·조회 시점·녹음 ID·원본과 canonical 표기·날짜 정밀도·매칭 판정의 근거가 필요하다. provider id는 namespace에 속하며 Archive UUID나 전역 identity가 아니다. AI가 붙인 id/date는 근거를 대체하지 못한다.

발매 종료 월 이후 제외·동월 허용·Era 시작 이전 곡 허용. 재발매/compilation 날짜를 최초 발매일로 오인하지 않고 충돌은 날짜 삭제로 우회하지 않는다. 부분 날짜는 가능한 월 범위 비교를 검토하고 종료 경계를 확정할 수 없으면 보류하는 제안이다. 월·일을 01로 지어내지 않는다. TrackInput의 일 단위 날짜 계약에 부분 날짜를 옮기는 방식은 D4 미정이다.

기존 검색/Seed/D1의 Unknown 허용을 이번에 변경하지 않는다. AI에서 날짜 미상까지 허용할지, 곡 존재·identity 증거만으로 충분한지는 Needs Decision이며 결정 전에는 미검증 곡을 정상 후보로 흘리지 않는 보수적 경계를 제안한다.

## 5. ID·중복·session 연결 — 설계만

- 텍스트 hash·index·매 요청 UUID를 최종 candidate ID로 사용하지 않는다. metadata 검증 후 canonical 녹음 identity 대응이 필요하다. 번역명·여러 provider ID가 같은 곡일 수 있다.
- D1 historical:<catalogTrackId>는 변경하지 않는다. AI가 같은 카탈로그 곡을 찾으면 같은 identity로 대응해 cross-source 재노출을 막아야 한다. AI 후보 namespace·카탈로그 밖 곡의 안정 ID·수명은 Needs Decision이며 별도 prefix만 붙인 것으로 중복 해결이라 하지 않는다.
- Strong Seed UUID는 Archive 조회 후 canonical 매핑으로 제외한다. 후보 ID/provider ID와 직접 비교하지 않는다. 매핑 미완료는 보류/진단할 조건이다.
- completedRounds.candidateIds와 현재/이탈 round shown을 canonical identity로 제외한다. 응답 없어도 shown이다. ID→곡 metadata의 메모리 조회 레지스트리가 후속에 필요하지만 기존 영구 session/localStorage를 변경하지 않는다.
- 제안 단계와 검증 후 두 번 중복 제거한다. identity가 같으면 1곡, 최종 최대 15곡. 부족하면 실제 수만 반환하며 미검증 곡이나 무제한 요청으로 채우지 않는다.
- round 시작에 준비한 후보 snapshot을 고정하고 응답 클릭·리렌더마다 재요청하지 않는다. Era 변경·취소·늦은 응답·중복 실행 방지는 D3~D6 요청 수명 관리에서 검증한다.
- 화면은 기존 TrackSummary·세 응답을 재사용할 수 있다. 표시·생성·metadata 검증만으로 Archive 저장하지 않는다. LISTENED 실제 저장 및 feedback 영구 저장은 별도 단계다. 현재 App candidates=[] 유지.

## 6. 다양성·실패·비용

모델에 좌우되는 부분: 시대 적합성·취향 주변 폭·덜 유명한 곡 제안·사용자의 실제 청취 비율. Seed 한두 곡으로 전체 장르 preference를 확정하지 않는다.

코드로 보장할 대상: 형식/호출 예산, 미검증 보류, 미래곡 제외, identity 중복·Seed·shown 제외, 최대 15곡, Archive 자동 저장 금지. **D2 코드가 보장하는 부분은 형식·문자수·제안수·표기 중복 검사뿐**이다.

다양성 baseline 제안: 검증된 artist당 최대 2~3곡 cap과 알려진 발매연도별 순환을 비교한다. 정확한 cap·부족분 때 완화·미상 연도는 Needs Decision. 발매연도는 차트 활동 연도가 아니며 Older 곡도 유지한다. 장르 quota/scoring 없음. AI의 artist alias/연도로 다양성 보장을 계산하지 않는다.

호출 baseline 제안: round당 AI 1회, transient 실패에 추가 retry 최대 1회, timeout·output token/응답 크기 cap. metadata는 유효 제안 최대 30개, 제한된 동시성·요청 간격, transient 추가 retry 최대 1회 및 round 전체 요청/시간/비용 cap 적용을 검토한다. 429 대기가 예산을 넘으면 중단한다. invalid JSON 수정용 LLM 루프·빈 결과 무한 재생성·무제한 top-up 금지. 정확한 예산은 공급자 확인 후 D3/D4에서 결정하고 D2가 네트워크 예산을 집행한다고 표현하지 않는다.

실패를 AI 통신 실패·형식 실패·정상 빈 제안·metadata 미해결/조회 실패·제외 후 소진·부분 성공으로 구분하는 최소 orchestrator result를 후속에 설계한다. 실패를 정상 Unknown으로 바꾸지 않는다.

측정 제안: provider/model 설정, 입력/출력 token usage(제공 시), attempt/retry·지연·timeout/429/5xx/형식 오류율, 제안→검증→공급 수, metadata 실패율. 비용은 단가·시점 기반 추정과 실제 청구를 구분하고 측정 불가는 0 대신 unavailable로 남긴다. key·원문 prompt·개인 feedback를 로그/공개 fixture에 기본 저장하지 않는다. 실제 모델 비교·비용 측정은 이번에 하지 않는다.

## 7. 검증 범위와 D3~D6 제안

D2 합성 테스트: 정상/빈/30/31개, 잘못된 JSON·top-level·code fence, 공백/비문자/길이 초과, AI date/id 추가, 부분·전체 행 탈락, Unicode/공백/대소문자 중복, 다른 version 비병합, 입력 불변. 실제 곡·개인 실험 응답은 fixture로 쓰지 않는다.

후속 경계 테스트: 0 Seed, context 예산 초과, 정상 not-found vs lookup failure, 다른 artist/version, 종료월/다음월/Older/부분 날짜/재발매, alias·cross-source 중복, Seed/untouched shown·불명확 매핑, 15 미만·artist/연도 편중, 예산 소진·취소/late response·중복 실행, round snapshot, key 비노출·Archive/localStorage 불변.

| 단계 (모두 예정) | 제안 완료 기준 |
| --- | --- |
| D3 | 공급자 독립 prompt/context builder·요청 예산/transport interface를 mock 검증. 서비스·모델·브라우저 key 노출 없는 실행 위치·개인정보 전달 범위 결정. 서버 도입 자동 승인 아님 |
| D4 | metadata 검증 adapter를 mock 중심으로 구현. identity·날짜 정밀도·future·조회 실패 분리. 공급자/이용조건·날짜 미상 정책 결정 |
| D5 | canonical ID·Seed/shown/cross-source 제외·최대 15·단순 다양성·round snapshot. 조회 레지스트리 수명/이탈 처리 검증 |
| D6 | 실행 위치·예산·이용조건 확정 후 별도 승인된 제한 실험/비용·실패율 측정 및 App 연결 검토. 실제 작은 모델로 fresh 평가. feedback 영구 저장·기존 E~I 자동 구현 아님 |

AI를 기존 D-25 generator taxonomy에서 어떻게 분류할지, Historical과의 source 비율, 실제 서비스/모델·실행 위치, 검증 미상 허용·ID 규칙·수치 정책은 Needs Decision이다. D1을 폐기하거나 AI를 HISTORICAL_CHART로 위장하지 않는다.
