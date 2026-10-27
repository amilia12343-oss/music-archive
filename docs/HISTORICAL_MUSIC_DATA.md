# Phase 5 D0 — 과거 음악 데이터 설계

기록일: 2026-10-27. **D0 문서 설계 완료 / 데이터 확보·모델 코드·후보 공급은 미구현.**

제품 기준은 [PRODUCT_SPEC](PRODUCT_SPEC.md), 구현 상태는 [ROADMAP](ROADMAP.md), 결정 상태는 [DECISIONS](DECISIONS.md)의 D-26을 따른다. 아래 필드는 개념적 설계 제안이며 TypeScript 타입·DB schema·새 persistence contract가 아니다.

## 1. 범위와 현재 코드 경계

- 장기 목표는 1990년~현재의 음악 환경을 추적하는 카탈로그다. 첫 검증 범위는 2016~2018년을 고려하되 데이터 이용 범위 확인 전 수집·복제·배포·production 연결을 하지 않는다.
- A/B/C는 구현됨. App의 Reconstruction은 현재 candidates=[]를 받고, session은 메모리에만 있다. D0로 실제 추천이 동작하게 되지는 않는다.
- 현재 Track은 사용자 Archive의 UUID와 title·artist·optional albumImageUrl/releaseDate다. EraTrack은 사용자 확인 관계다. 차트에 등장했다는 이유만으로 이 저장소에 Track/EraTrack을 생성하지 않는다.
- 이번 문서의 카탈로그 Track은 곡 자체를 나타내는 같은 도메인 개념이지만, 현재 사용자 Archive 레코드와 ID 공간·수명은 다르다. 카탈로그 ID를 Archive Track.id로 대체하지 않는다. 새 영구 모델 구현·DB·Neon·서버·migration은 범위 밖이다.

## 2. 최소 책임과 관계 — 추천 설계 / 미구현

| 개념 | 책임 | 최소 의미 및 필요한 보조 정보 |
| --- | --- | --- |
| Track (카탈로그) | 특정 곡/녹음의 정체성과 표시 metadata | catalogTrackId, title, artist; 알려진 경우 releaseDate와 날짜 정밀도·근거, albumImageUrl. 순위·차트 월은 넣지 않음 |
| ChartSource | 하나의 비교 가능한 차트 시리즈 정의 | sourceId, 운영기관/출처명, chartName, 시장·대상 범위, 지표(digital 등), 주기(month/week/year), 공식 근거 위치; 커버리지·이용 상태는 아래 관리 기록과 연결 |
| ChartEntry | 특정 출처의 특정 집계기간에서 관측된 순위 | sourceId, catalogTrackId, periodStart/periodEnd, rank; 원본 title/artist 및 제공되는 sourceTrackId·근거 위치 보존 |

관계: Track 1:N ChartEntry, ChartSource 1:N ChartEntry. 같은 Track은 여러 월·출처에 등장할 수 있다. ChartSource는 운영기관 하나가 아니라 지표·주기·시장까지 고정된 시리즈다. 지표 변경으로 비교 의미가 달라지면 별도 시리즈로 구분한다.

- 월간 기록은 해당 월 시작·종료를 뜻한다. 주간·연간 자료를 월간 기록처럼 복제하지 않는다.
- 같은 source·period·canonical Track의 중복 입력은 통합 검토 대상이다. 원본 정정본의 충돌은 근거를 남기고 판정하며 임의로 유리한 순위를 고르지 않는다. 같은 곡의 여러 source ID가 같은 월에 있는 경우 명확히 동일 녹음임을 확인한 뒤 후보 계산용 최선 순위 하나로 축약하되 원본 근거는 보존한다.
- 다른 출처의 ChartEntry는 삭제·합산하지 않는다. 후보에서는 곡 하나로 묶고 여러 출처를 provenance로 유지한다. 출처 사이 1위는 같은 크기의 인기 점수라고 가정하지 않는다.

## 3. 발매 시기와 차트 등장 시기

releaseDate는 녹음/발매의 metadata이고 ChartEntry의 period는 당시 차트에 관측된 시기다. 재진입·계절 반복·재발매로 여러 기간에 등장해도 곡의 최초 발매일을 바꾸지 않는다. 차트 첫 등장 월을 발매일로 대입하지 않는다.

- 연도만 알려진 날짜는 연도 정밀도로 보존한다. 월·일을 01로 만들어 사실처럼 저장하지 않는다. 현재 TrackInput은 유효한 일 단위 날짜만 소비하므로 부분 날짜는 향후 adapter에서 생략하고 원래 정밀도/근거는 카탈로그에 남기는 방향을 검토한다.
- 발매일 미상이라도 유효한 Era 내 차트 기록은 당시 존재의 근거가 될 수 있다. Era 시작 이전 발매곡도 허용한다.
- 차트 기간보다 미래인 알려진 releaseDate는 재발매 metadata 오매칭 등 충돌을 점검한다. 무조건 날짜를 지우거나 기존 future 필터를 우회하지 않는다. 충돌 곡은 확인 전 후보 공급에서 보류하는 보수적 제안이다. 기존 검색·Seed/addTracksToEra 필터는 그대로 유지한다.
- 실제 월간 차트는 개인의 청취 증거가 아니다. 사용자의 LISTENED 확인 전 Archive로 저장하지 않는다.

## 4. 곡 동일성·표기 차이·결측

1. 출처 원본 표기를 보존한다. trim·Unicode 정규화·대소문자·공백 등 비교키는 검색 보조이며 ID 자체로 쓰지 않는다.
2. 동일 title+artist는 매칭 후보를 만들 뿐 완전한 동일 녹음 증거가 아니다. 동명이곡·live/remix·다른 가수 cover를 자동 병합하지 않는다. 괄호나 featuring을 일괄 삭제하지 않는다.
3. 확인된 한글/영문 제목·아티스트 alias는 특정 canonical Track에 명시적으로 연결하고 근거를 기록한다. 출처별 sourceTrackId는 매핑 단서이지 최종 identity가 아니다. 여러 ID가 같은 녹음을 가리킬 수 있고 source 간 ID가 충돌할 수도 있다.
4. 애매한 매칭은 unresolved로 보류한다. 범용 fuzzy/ML identity 시스템은 만들지 않는다. 미확정 행을 별도 곡으로 무조건 노출해 중복 없음이라고 주장하지 않는다.
5. title/artist·유효한 period·양의 정수 rank·출처가 없으면 ranked 공급 대상에서 보류하고 사유를 관리한다. 이미지·발매일·sourceTrackId 결측은 허용한다. title/artist 결측을 빈 문자열의 정상 곡으로 만들지 않는다.
6. metadata 조회 실패와 정상 조회 후 metadata 부재는 구분한다. future 검증이 필요한데 조회에 실패한 것을 검증 완료 Unknown으로 바꾸지 않는다. 이번 D0에서는 외부 metadata 조회도 하지 않는다.

카탈로그 매핑과 현재 sameSong(trim+소문자 title/artist) 규칙은 다르다. D0에서 앱의 동일 Era 중복 로직·전역 비병합 정책을 변경하지 않는다.

## 5. 출처·커버리지·이용 범위 관리

### 시대별 검토 범위 (확보 사실이 아닌 조사 계획)

| 시기 | 검토 방향 | 표현해야 할 한계 |
| --- | --- | --- |
| 1990~2009 | 권리자가 확인된 방송·음반·기타 역사 차트/자료의 존재·집계기준 조사 | 판매·방송·온라인 소비 지표가 다를 수 있음. 월간 자료 존재·완전성을 전제하지 않음 |
| 2010~현재 | 허가 범위가 확인된 digital 등 시리즈의 기간별 coverage 조사 | 모든 월·연도가 확보되었다고 가정하지 않음. 지표·차트 범위 변경도 추적 |

위 시대 구분은 조사 우선순위이며 특정 기관의 서비스 시작연도나 데이터 보유 범위를 검증한 진술이 아니다. 현재 진행 중인 월은 완결 월로 취급하지 않는다.

별도 복잡한 서비스 대신 초기에는 출처 관리 문서/작은 manifest로 다음을 추적하는 설계를 권한다. 실제 자료는 이번에 만들지 않는다.

- sourceId별 coverage: 기간·주기·예상 순위 깊이, 확인된 가용기간, 실제 보유/검증 기간, 누락 기간, 부분/완결 여부, 확인일·근거. 기간별 unknown / available / missing / partial / verified를 구별한다. 조회 실패는 missing 자료라고 단정하지 않는다.
- 사용 권한: not_checked / pending / permitted / restricted / denied와 요청·답변일, 근거 참조, 허용 기간·필드·목적, 수집·내부 저장·사용자 표시·재배포 각각의 허용 여부, 표시 의무·만료/재검토일을 기록한다. permitted 한 값으로 모든 사용을 허용하지 않는다.
- 제한 변경·철회 시 해당 출처 공급을 중단하고 보존/삭제 범위는 확인된 조건에 따라 결정한다. 문의 메일 개인정보·비공개 답변 원문은 공개 저장소에 넣지 않는다.

현재 권한 상태는 사용자 보고 기준: **Circle 월간 Digital 데이터 이용 문의 pending, 답변 대기.** Melon은 이번 작업에서 허가를 확인하지 않았다(not_checked). 공개 열람·기존 실험 파일 존재는 production 이용 허가를 뜻하지 않는다. 양쪽 모두 허가 확인 전 production 연결 금지. 이는 법적 권한을 판정한 것이 아니라 프로젝트의 공급 승인 경계다.

Coverage와 permission은 별개다. 해당 월 자료가 있어도 허용 목적이 맞지 않으면 공급하지 않으며, 허가가 있어도 없는 월을 채워 만들지 않는다. 1990~현재 전체 coverage 달성을 완료로 표시하지 않는다.

## 6. 최소 HISTORICAL_CHART 공급 흐름 — Candidate / Needs Decision

다음은 2016~2018 첫 검증을 위한 단순한 baseline 제안이다. 고정 제품 ranking/weight로 확정하거나 구현하지 않는다.

1. 입력은 Era의 startMonth/endMonth, 메모리 session, 기존 Archive tracks. 허가·범위·품질을 확인한 월간 ChartEntry만 대상으로 삼는다. 처음에는 허용된 한 시리즈를 우선하며 다른 지표의 순위를 섞어 점수화하지 않는다.
2. Era와 겹치는 월의 기록을 조회한다(시작·종료 월 포함). 비월간 자료는 월간과 섞지 않고 후속 정책을 결정한다. 월별 단위가 없는 자료를 임의로 12개월에 복제하지 않는다.
3. 확인된 catalogTrackId로 모든 출처·월의 같은 곡을 하나로 묶는다. unresolved 및 날짜 충돌 보류 행은 제외한다.
4. completedRounds.flatMap(round => round.candidateIds)를 이미 노출된 ID 집합으로 도출한다. 현재 진행 중인 후보도 다음 요청 전 제외 입력으로 포함해야 한다. 완료된 round 이력만으로 중도 이탈한 미확정 round의 표시 이력까지 보장할 수는 없으며, 그 수명은 D 연결 시 결정한다.
5. strongSeedTrackIds는 Archive UUID이므로 먼저 Archive tracks를 조회한 뒤 카탈로그와 확인된 identity/alias로 대응시킨다. candidate ID와 UUID를 직접 비교하지 않는다. 최소 동일 title/artist 비교를 재사용할 수 있으나 alias 미해결로 Seed 재등장 가능성이 있으면 매핑 보류·진단하고 보장 범위를 명시한다. 이 매핑 검증이 후보 공급의 선행 조건이다. Strong Seed가 0곡이면 제외집합이 비어도 정상이다.
6. Era 전체 달력을 순서대로 최대 3개 연속 구간으로 균등 분할한다(월 수가 적으면 구간 수도 줄임). 3구간이면 각 5곡을 목표로 한다. 이 숫자는 15곡의 시기 균형을 비교할 baseline일 뿐 확정 quota가 아니다.
7. 구간 안에서 월별 후보 큐를 rank 오름차순·동률 catalogTrackId 순으로 만들고, 월을 돌아가며 한 곡씩 선택한다. 이미 선택된 같은 곡은 건너뛴다. 월간 큐의 시작 월은 round 번호에 따라 순환하는 제안으로 초기 월 쏠림을 줄인다. 특정 월에 등장한 곡이 다른 월에도 있는 경우 선택된 구간·월 근거만 별도로 남기고 곡을 반복 선택하지 않는다.
8. 각 구간 목표를 채운 뒤 부족분은 남은 구간·월 큐를 같은 순환 규칙으로 탐색해 채운다. 전체 최대 15곡, 내부 중복 0. 가능한 곡이 15 미만이면 실제 수만 반환하며 Era 밖·Seed·기노출·미허가 자료나 fake로 채우지 않는다. 빠진 구간은 coverage 부족으로 설명하고 균형 달성을 주장하지 않는다.
9. 선정 순서와 화면 표시 순서는 구분한다. 최종 목록은 제품의 아티스트 오름차순 표시 방향을 따른다. 정확한 월 순환·구간 수·부족분 정책과 출처 우선순위는 검증 후 결정한다.

같은 곡의 장기 차트 체류가 후보 수를 독점하지 않도록 곡별 1회·구간별 분산을 우선한다. 여러 출처에 등장했다는 이유로 가산점을 자동 부여하지 않는다. 소스 간 종합 인기 점수·개인화·genre scoring은 D0에서 설계하지 않는다.

## 7. 현재 타입과 연결할 지점

- catalogTrackId에 고정 prefix를 붙인 historical:<catalogTrackId> 같은 안정적 후보 ID를 제안한다. 차트 월·출처·배열 index·round마다 새 UUID로 ID를 만들지 않는다. 다른 출처에서 같은 곡을 찾아도 같은 후보 ID여야 한다. alias 확정 전 ID를 재발급하면 exclusion이 깨지므로 검토 완료 곡만 공급하고 session 도중 매핑을 변경하지 않는 방향을 검토한다.
- adapter 출력은 기존 ReconstructionCandidate의 { id, track: TrackInput }만 사용한다. title·artist·지원되는 optional metadata만 변환하며 rank·source 권한·부분 날짜를 TrackInput에 억지로 넣지 않는다. 근거/매핑은 카탈로그 조회 측에 유지한다. source enum·새 ID 필드 등을 현 타입에 미리 추가하지 않는다.
- App.handleCompleteSeeds의 현재 session 생성은 유지한다. strongSeedTrackIds snapshot을 공급 입력으로 사용하되 Strong Seed entity는 만들지 않는다.
- App이 Reconstruction에 candidates=[]를 넘기는 자리가 향후 adapter 출력 연결 지점이다. 현재 round 시작 전에 얻은 후보 배열은 해당 round 동안 안정적으로 유지해야 한다. 이번에는 연결하지 않는다.
- handleCompleteRound는 candidateIds와 responses를 분리해 completedRounds에 누적하고 다음 번호를 갱신한다. LISTENED / NOT_LISTENED / UNASSIGNED별 응답은 여기서 도출하며 untouched는 response 없이 shown history에만 있다. UNASSIGNED를 현재 Era Anchor나 부정으로 쓰지 않는다.
- 중도 이탈 후 기억 더 찾기·실제 다음 후보 요청·데이터 준비 오류 안내는 후속 연결 작업이다. 현재는 상세 복귀하며 session 새로고침 복원 없음. session과 lookup metadata를 localStorage에 추가하지 않는다.
- 카탈로그 Track의 존재나 후보 표시·평가만으로 사용자 Archive에 곡을 넣지 않는다. 향후 명시적 LISTENED 저장 작업에서도 기존 UUID/중복 방지 정책과 연결하는 별도 검토가 필요하다. 이번에 feedback 영구 저장을 구현하지 않는다.

## 8. 미결정 사항과 후속 검증

| Needs Decision | 확인 조건 |
| --- | --- |
| 실제 출처·기간·필드·이용 범위 | Circle 답변 및 각 출처 근거 확인; 허가 없으면 실제 데이터 연결 착수하지 않음 |
| 1990~2009 자료와 비월간 주기 | 자료 유무·지표·대표성 조사 후 별도 취급. monthly coverage로 위장하지 않음 |
| 곡/녹음 identity와 Seed 대응 | 번역명·재발매·동명이곡·cover·출처 ID 충돌 검증; 매핑 관리의 정확한 파일 형식은 미정 |
| 부분 날짜·차트/발매 충돌 | 원본 근거로 판정 후 adapter·현재 필터와의 일관성 검토; 앱 필터를 몰래 변경하지 않음 |
| 기간 균형 및 부족분 baseline | 한 달/짧은 Era/36개월, 빈 구간, 출처 중복·월내 중복·동순위·15 미만 검증 |
| session 진행 중 노출 이력 | 완료 전 이탈·다음 round 재개에서도 동일 후보 exclusion을 어떻게 보장할지 결정 |

D0 문서 검토 기준: releaseDate와 차트 period 분리, 반복 등장의 기록 보존, source 간 중복 후보 제거, 안정적 ID, Seed UUID 대응, untouched shown 제외, 0 Seed, 누락/미허가 상태, 시기 균형 및 15곡 미만 처리. 후속 구현에서 실제 허가된 자료로 검증하기 전까지 설계 검토를 실행 검증으로 표시하지 않는다.
