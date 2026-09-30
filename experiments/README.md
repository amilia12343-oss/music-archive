# Music Archive experiments

Music Archive의 memory reconstruction / recommendation 연구 기록입니다. production 앱은 `src/`에서 실행하며 이 폴더를 import하지 않습니다. 실험 후보와 feedback은 연구 입력·결과이며 앱의 영구 Seed나 사용자 데이터 모델이 아닙니다. 실험 성공은 앱 추천 기능의 구현 완료를 뜻하지 않습니다.

## 구조

```text
experiments/
├─ scripts/                 실행 가능한 .mjs 실험
├─ data/
│  ├─ circle/               여러 실험이 사용하는 2016–2018 기준 차트
│  └─ hybrid/               사용자가 수정·확인한 Round 1 실험 feedback
├─ results/
│  ├─ lastfm/
│  ├─ listenbrainz/
│  ├─ circle/               과거 3개월 샘플 수집 결과 보존
│  ├─ hybrid/               Round 1, Round 2 결과
│  └─ cochart/              co-chart v1, v2 결과
└─ diagnostics/             과거 검색 오류 확인용 HTML 보존
```

Circle 전체 JSON도 수집 스크립트의 출력이지만, 여러 후속 실험의 기준 dataset이므로 `data/circle/`에 한 부만 둡니다. Hybrid·co-chart 결과가 다음 실험 입력으로 사용되어도 원래 derived result 위치를 유지합니다. JSON 안의 `inputs`·`round1File`에 남은 파일명은 당시 데이터 출처의 basename이며 실행 경로가 아닙니다. 실제 위치는 아래 표를 따릅니다.

## 실험과 입출력

경로는 `experiments/` 기준입니다. 스크립트 이름은 기존 것을 유지했습니다.

| 스크립트 (`scripts/`) | 역할 | 입력 | 출력 |
| --- | --- | --- | --- |
| `recommendation-test.mjs` | Last.fm track similarity coverage·후보, 검색 fallback 비교 | 코드의 원본 Seed 12곡, Last.fm·iTunes API | `results/lastfm/recommendation-fallback-output.json` |
| `listenbrainz-recommendation-test.mjs` | ListenBrainz collaborative similarity coverage 비교 | 원본 Seed 12곡, Dataset Hoster·iTunes API | `results/listenbrainz/listenbrainz-recommendation-output.json` |
| `circle-chart-test.mjs` | historical chart data, 36개월 TOP 100·시간 균형 후보 | Circle first-party JSON API | `data/circle/circle-chart-2016-2018.json` |
| `hybrid-recommendation-test.mjs` | historical chart + similarity 후보 구성 | Circle dataset, Last.fm 결과 | `results/hybrid/hybrid-recommendation-2016-2018.json` |
| `hybrid-round2-test.mjs` | 확인된 Round 1 곡으로 feedback similarity 비교 | Circle dataset, Hybrid Round 1, `data/hybrid/hybrid-round1-feedback.json`, Last.fm·iTunes API | `results/hybrid/hybrid-round2-2016-2018.json` |
| `cochart-recommendation-test.mjs` | confirmed listening 곡과 같은 월의 차트로 historical-context personalization | Circle dataset, Hybrid Round 1·Round 2, Round 1 feedback | `results/cochart/cochart-round3-2016-2018.json` |
| `cochart-v2-test.mjs` | candidate chart duration·pair Jaccard로 co-chart bias correction 비교 | v1 입력 전부와 co-chart v1 결과 | `results/cochart/cochart-v2-2016-2018.json` |

의존 흐름: Circle dataset + Last.fm 결과 → Hybrid Round 1 → 수동 Round 1 feedback → Hybrid Round 2 → co-chart v1 → co-chart v2. ListenBrainz는 별도 비교 실험입니다. co-chart 두 실험의 Seed는 Round 1 positive feedback만 사용합니다.

`results/circle/circle-chart-sample.json`은 3개월 샘플의 과거 기록입니다. 현재 Circle 스크립트는 36개월 전체 dataset을 생성하므로 샘플 파일을 덮어쓰지 않습니다. `diagnostics/search-error-check.html`은 당시 production 컴포넌트를 직접 불러오는 일회성 검색 실패 fixture입니다. 현재 props 계약과 다를 수 있어 유지보수된 앱 테스트나 독립 실행 명령으로 취급하지 않습니다.

## 실행

Node.js 24 환경에서 확인했습니다. repository root에서 다음 명령을 사용합니다. 파일 입출력은 `import.meta.url` 기준이므로 다른 작업 디렉터리에서 스크립트의 절대 경로로 실행해도 같은 파일을 읽고 씁니다. 결과 폴더는 실행 시 생성합니다.

| 명령 | 네트워크 / 환경변수 |
| --- | --- |
| `node experiments/scripts/recommendation-test.mjs` | Last.fm·iTunes 호출. `LASTFM_API_KEY` 필요 |
| `node experiments/scripts/listenbrainz-recommendation-test.mjs` | Dataset Hoster·iTunes 호출. 토큰/key 없음 |
| `node experiments/scripts/listenbrainz-recommendation-test.mjs --diagnostic` | TWICE 단일 recording-search, 파일 저장 없음. 토큰/key 없음 |
| `node experiments/scripts/circle-chart-test.mjs` | Circle 36개월 순차 요청. 토큰/key 없음 |
| `node experiments/scripts/hybrid-recommendation-test.mjs` | 기존 JSON만 사용. 네트워크/key 없음 |
| `node experiments/scripts/hybrid-round2-test.mjs` | positive feedback 곡의 Last.fm·iTunes 요청. `LASTFM_API_KEY` 필요 |
| `node experiments/scripts/cochart-recommendation-test.mjs` | 기존 JSON만 사용. 네트워크/key 없음 |
| `node experiments/scripts/cochart-v2-test.mjs` | 기존 JSON만 사용. 네트워크/key 없음 |

API key는 환경변수로만 전달하며 파일이나 문서에 기록하지 않습니다. 스크립트가 `.env`를 자동으로 읽는 것은 아닙니다. 수집/API 실험을 다시 실행하면 결과와 그 결과를 쓰는 후속 실험이 달라질 수 있으므로, 이전 결과와 비교한 뒤 변경을 보존합니다.

## 관리 규칙

- 새 실행 코드는 `scripts/`, 재사용 dataset·수동 입력은 `data/<source>/`, derived output은 `results/<experiment>/`에 둡니다. root에 실험 JSON을 생성하지 않습니다.
- `results/`는 비교·포트폴리오 연구 기록으로 Git에 유지합니다. 파일 크기와 개인정보·credential 포함 여부를 저장 전에 확인합니다.
- production은 experiments를 import하지 않고, 새 실험도 기본적으로 `src/` 구현에 의존하지 않습니다. 기존 diagnostic fixture는 역사적 예외로 보존했습니다.
- 제품에 적용할 가치가 검증된 로직은 별도 제품 작업에서 검토합니다. 이 정리는 scoring·alias·Jaccard·제품 요구의 변경이 아닙니다.
- 이동 후 `node --check`로 모든 스크립트를 검사하고, offline 실험은 저장된 데이터로 실행해 기존 결과와 비교합니다. 경로 검증만을 위해 외부 API를 호출하지 않습니다.
