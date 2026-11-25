# DuoAsset

부부 두 사람이 함께 쓰는 자산관리 서비스입니다. 매일 가계부를 쓰는 대신 **한 달에 한 번, 5분 정도 잔액과 수입만 확인**하면 소비·저축·순자산 변화가 계산되고, 앞으로의 자산 전망까지 볼 수 있습니다.

- 두 사람이 각자 계정으로 로그인해 같은 가계 데이터를 봅니다.
- Android · iOS · PC에서 같은 주소로 접속합니다. 홈 화면에 설치하면 앱처럼 실행됩니다(PWA).
- 한국어, 원화(KRW), Asia/Seoul 기준입니다.

## 무엇을 할 수 있나

| 화면 | 내용 |
|------|------|
| 홈 | 순자산·총자산·총부채·가용자산, 이번 달 계획, 지난 정산 결과, 자산 추이, 다가오는 일 |
| 월급·배분 | 급여·상여금·고정지출·저축·공용통장 납입을 등록하면 개인 사용 가능 금액과 공동저축을 계산 |
| 공용통장 | 예정·실제 입금, 공동생활비 예산 대비 실적, 공동저축, 전월 비교 |
| 월 정산 | 수입과 잔액을 확인하면 소비지출·저축액·저축률·원금 상환·평가손익을 계산하고 월을 마감 |
| 자산 | 통장·예적금·주식·연금·부동산·보증금·분양 납부금·자동차 등 자산별 평가금액과 추이 |
| 부채·고정지출 | 무이자 할부, 원리금균등, 원금균등, 만기일시, 원금 유지 차용금의 예정·실제 상환과 종료 시점 |
| 목표 | 비상금·입주 자금·순자산 목표의 달성률과 예상 달성 시점 (자산 중복 배정 방지) |
| 미래 시뮬레이션 | 연봉 인상률·생활비·투자 수익률과 입주·이직·육아휴직 같은 이벤트를 넣어 시나리오 비교 |
| 설정 | 가구·배우자 초대, 테마, 비밀번호, 백업 내보내기·복원, 앱 설치 안내 |

계산 방식의 핵심은 **소비를 입력받지 않고 잔액 변화에서 역산**하는 것입니다. 계좌 간 이체, 공용통장 납입, 적금 납입은 자산의 위치만 바꾸므로 저절로 상쇄되고, 대출 원금 상환과 투자 평가손익은 저축과 분리됩니다. 자세한 정의는 [docs/finance-rules.md](docs/finance-rules.md)에 있습니다.

## 기술 스택

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui 방식 컴포넌트(Radix) · Supabase (PostgreSQL · Auth · RLS) · TanStack Query · Recharts · Vitest · Playwright

선정 이유와 구조는 [docs/architecture.md](docs/architecture.md)를 참고하세요.

## 로컬에서 실행하기

준비물: Node.js 22 이상, Docker (로컬 Supabase용)

```bash
npm install

# 1. 로컬 Supabase 시작 (처음에는 이미지를 받느라 몇 분 걸립니다)
npx supabase start

# 2. 환경변수 설정: 로컬 스택의 주소와 공개 키를 .env.local 에 적습니다
cp .env.example .env.local
npx supabase status -o env   # API_URL → NEXT_PUBLIC_SUPABASE_URL, PUBLISHABLE_KEY → NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

# 3. (선택) 가상의 부부 데이터 넣기 — 계정 2개와 6개월치 기록, 로그인 정보가 출력됩니다
npm run seed

# 4. 개발 서버
npm run dev                  # http://localhost:3000
```

가상 데이터 없이 시작하려면 로컬 Supabase Studio(`npx supabase status`에 주소가 나옵니다)의 Authentication에서 사용자를 만들고 로그인하면 됩니다. 가구가 없는 계정은 온보딩 화면으로 이동합니다.

## 실제로 사용하기 (배포)

무료 플랜만으로 운영할 수 있습니다: Supabase(데이터·인증) + Vercel(웹).

### 1. Supabase 프로젝트

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다. 지역은 가까운 곳(예: Seoul)을 고릅니다.
2. 스키마를 적용합니다.
   ```bash
   npx supabase login
   npx supabase link --project-ref <프로젝트 ref>
   npx supabase db push
   ```
   CLI를 쓰지 않으려면 대시보드의 SQL Editor에서 `supabase/migrations/`의 파일을 이름 순서대로 실행해도 됩니다.
3. **공개 회원가입을 끕니다.** Authentication → Sign In / Providers에서 "Allow new users to sign up"을 끕니다. (이 서비스는 두 사람만 씁니다.)
4. **계정 두 개를 만듭니다.** Authentication → Users → Add user에서 본인과 배우자의 이메일·비밀번호로 사용자를 만듭니다. "Auto Confirm User"를 켭니다.
5. Project Settings → API Keys에서 **Project URL**과 **Publishable key**(`sb_publishable_…`)를 확인합니다.

> `service_role` / `sb_secret_…` 키는 이 앱에 넣지 않습니다. 브라우저에 공개되는 키는 Publishable key뿐이고, 데이터 보호는 DB의 RLS 정책이 담당합니다.

### 2. Vercel

1. 이 저장소를 Vercel에 Import 합니다.
2. Environment Variables에 다음을 넣습니다.

   | 이름 | 값 |
   |------|----|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable key |
   | `CRON_SECRET` | 임의의 긴 문자열 (예: `openssl rand -hex 32`) |

3. Deploy 합니다. HTTPS는 Vercel이 자동으로 적용합니다.

`vercel.json`의 크론이 하루 한 번 `/api/keepalive`를 호출합니다. Supabase 무료 플랜은 7일 동안 활동이 적으면 프로젝트가 일시중지되는데, 한 달에 한 번 쓰는 서비스라 이 호출이 없으면 멈출 수 있습니다. `CRON_SECRET`을 설정하면 Vercel Cron만 이 주소를 호출할 수 있습니다.

### 3. 처음 사용

1. 본인 계정으로 로그인하면 **가구 만들기** 화면이 나옵니다. 가구 이름, 두 사람의 이름, 배우자의 로그인 이메일, 기준 월을 입력합니다.
2. 배우자가 자기 계정으로 로그인하면 자동으로 같은 가구에 연결됩니다.
3. 자산과 부채를 등록하고, 월급·배분을 설정한 뒤, 기준 월을 마감합니다. 기준 월의 잔액이 출발점이고, 수입·소비 분석은 그다음 달 정산부터 나옵니다.
4. 휴대폰에서는 브라우저 메뉴의 "앱 설치"(Android Chrome) 또는 공유 → "홈 화면에 추가"(iOS Safari)로 설치합니다.

## 환경변수

| 이름 | 필수 | 설명 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | Supabase 프로젝트 주소 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✓ | Supabase 공개 키. 브라우저에 노출돼도 되는 값 |
| `CRON_SECRET` | 권장 | `/api/keepalive` 보호용. Vercel Cron이 `Authorization: Bearer …`로 보냅니다 |

환경변수가 없으면 앱은 설정 안내 화면만 보여 줍니다. `.env*` 파일은 커밋하지 않습니다(`.env.example`만 예외).

## 명령어

```bash
npm run dev          # 개발 서버
npm run build        # 프로덕션 빌드
npm run start        # 빌드 결과 실행
npm run lint         # ESLint
npm run typecheck    # 타입 검사
npm test             # 단위 테스트 (재무 계산 등, 인프라 불필요)
npm run test:db      # 접근권한·월 마감·백업 통합 테스트 (로컬 Supabase 필요)
npm run test:e2e     # 브라우저 E2E (로컬 Supabase 필요. 별도 폴더에 빌드한 뒤 실행)
npm run seed         # 로컬 Supabase 에 가상 데이터 생성
```

## 테스트

- **단위 테스트** (`src/**/*.test.ts`): 월급 배분, 부채 일정, 월 정산, 목표, 시뮬레이션의 계산 규칙. 내부 이체 시 총자산 불변, 원금 상환과 이자의 분리, 평가손익과 저축의 분리, 미확인과 0원의 구분, 항등식의 무작위 검증 등을 포함합니다.
- **DB 통합 테스트** (`tests/db`): 실제 로컬 Supabase에 대해 비로그인 차단, 가구 간 격리, 초대 수락, 낙관적 잠금(동시 수정), 월 마감 후 수정 차단, 백업 복원을 검증합니다.
- **E2E** (`tests/e2e`): 로그인부터 정산·마감까지의 흐름을 모바일·PC 화면 크기로 확인합니다.

## 백업과 복원

Supabase 무료 플랜에는 자동 백업이 없습니다. **설정 → 데이터**에서 주기적으로 전체 백업(JSON)을 내려받아 두세요. 같은 화면에서 백업 파일로 복원할 수 있고, 새 Supabase 프로젝트로 옮길 때도 가구를 만든 뒤 복원하면 됩니다. 월별 요약은 CSV로도 내보낼 수 있습니다.

DB 전체를 덤프하려면 `npx supabase db dump --data-only -f backup.sql`을 쓸 수 있습니다.

## 보안

- 공개 회원가입 없음. 계정은 Supabase 대시보드에서만 만듭니다.
- 로그인하지 않은 요청은 서버(`src/proxy.ts`)에서 로그인 화면으로 보냅니다.
- 모든 테이블에 RLS가 적용되어 같은 가구의 구성원만 읽고 쓸 수 있습니다. 비로그인 역할에는 테이블 권한 자체가 없습니다.
- 마감한 달의 기록은 DB가 수정을 거부합니다.
- 두 사람이 같은 항목을 동시에 고치면 나중에 저장한 쪽에 알려 주고 덮어쓰지 않습니다.
- 서비스 워커는 정적 자산만 캐시합니다. 금융 데이터는 브라우저 저장소에 남기지 않고, 로그아웃하면 메모리에서도 지웁니다.
- 금융기관 비밀번호·인증서는 저장하지 않습니다. 은행 연동도 하지 않습니다.

## 문서

| 문서 | 내용 |
|------|------|
| [docs/requirements.md](docs/requirements.md) | 서비스 목적과 요구사항 |
| [docs/architecture.md](docs/architecture.md) | 구조, 기술 선택, 주요 설계 결정 |
| [docs/data-model.md](docs/data-model.md) | 테이블, RPC, 접근 권한 |
| [docs/finance-rules.md](docs/finance-rules.md) | 지표 정의와 계산 규칙 |
| [docs/ui-guide.md](docs/ui-guide.md) | 디자인 토큰과 컴포넌트 사용법 |
| [docs/roadmap.md](docs/roadmap.md) | 현재 제한사항과 향후 계획 |
| [AGENTS.md](AGENTS.md) | 개발 에이전트·기여자를 위한 지침 |
