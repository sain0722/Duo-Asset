# DuoAsset 개발 지침

부부 2인 전용 자산관리 서비스. 월 1회 정산으로 수입·저축·자산·부채·미래 계획을 관리한다. UI는 한국어, 통화는 KRW, 시간대는 Asia/Seoul.

먼저 읽을 것: [docs/architecture.md](docs/architecture.md), [docs/finance-rules.md](docs/finance-rules.md).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 명령

```bash
npm run dev          # 개발 서버
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # 단위 테스트 (Vitest, 인프라 불필요)
npm run test:db      # RLS·RPC 통합 테스트 (npx supabase start 필요)
npm run test:e2e     # Playwright (로컬 Supabase + 빌드 필요)
npm run build        # 프로덕션 빌드
```

변경 후에는 `lint`, `typecheck`, `test`, `build`가 모두 통과해야 한다.

## 지켜야 할 것

### 재무 계산

- 금액은 **원 단위 정수**만 쓴다. `0.1 * amount` 같은 계산 뒤에는 반드시 정해진 지점에서 한 번 반올림한다. 금액을 `toFixed`·`parseFloat`로 다루지 않는다.
- 계산은 `src/lib/finance`의 순수 함수에만 둔다. 컴포넌트 안에서 합계·비율을 직접 계산하지 않는다. React·Supabase를 `lib/finance`에서 import하지 않는다.
- 규칙을 바꾸면 `docs/finance-rules.md`와 테스트를 함께 고친다. 4절의 항등식 테스트는 항상 통과해야 한다.
- 계좌 간 이동·공용통장 납입·적금 납입을 지출로 집계하지 않는다. 비현금 복지를 수입·자산에 넣지 않는다.
- "미확인"(값 없음)과 0원을 구분한다. 미확인을 0이나 계획값으로 조용히 채우지 않는다.
- 마감된 달은 `months.summary`만 보여 준다. 현재 설정으로 다시 계산하지 않는다.

### 데이터와 보안

- DB 접근은 `src/lib/data`를 거친다. 컴포넌트에서 `supabase.from(...)`을 직접 호출하지 않는다.
- 수정은 읽었던 `version`을 함께 보낸다(`updateRow`). 충돌(`ConflictError`)은 사용자에게 알리고 다시 읽는다.
- 새 테이블에는 `household_id`, RLS 정책, 명시적 `grant`를 반드시 넣고 `tests/db`에 접근 권한 테스트를 추가한다.
- 금융 데이터를 `localStorage`·IndexedDB·서비스 워커 캐시·URL·로그에 남기지 않는다.
- 비밀키(`service_role`, `sb_secret_*`)를 클라이언트 코드나 `NEXT_PUBLIC_*`에 넣지 않는다. `.env*`는 커밋하지 않는다.
- 실제 급여·자산 금액을 코드, 시드, 테스트 픽스처에 넣지 않는다. 예시는 가상의 값만 쓴다.

### 코드

- 과한 추상화를 만들지 않는다. 두 사람이 쓰는 서비스다. 필요해진 뒤에 일반화한다.
- 특정 사람·항목·금액을 하드코딩하지 않는다. 모든 재무 설정은 UI에서 추가·수정·비활성화한다.
- DB 행 타입은 `src/lib/finance/types.ts`의 snake_case 인터페이스를 그대로 쓴다(매핑 계층 없음). 스키마를 바꾸면 이 파일도 고친다.
- 월은 `'YYYY-MM'` 문자열(`Ym`)로 다루고 `src/lib/month.ts`의 함수로만 연산한다. "이번 달"은 기기 시간대가 아니라 Asia/Seoul 기준이다.
- UI 문구는 한국어. 금액 표기는 `src/lib/format.ts`를 쓴다.

### UI

- 기본 컴포넌트는 `src/components/ui`, 공용 조합은 `src/components`, 화면 전용은 `src/features/<기능>`.
- 색·간격·반경은 `globals.css`의 토큰만 쓴다. 임의의 hex 색을 쓰지 않는다. 라이트/다크 모두 확인한다.
- 모바일(360px)에서 먼저 확인한다. 가로 스크롤이 생기면 안 된다. 터치 대상은 44px 이상.
- 금액에는 `tabular-nums`를 쓴다. 숫자가 주인공이고 장식은 최소화한다.
- 지표에는 정의를 볼 수 있는 도움말(`InfoTip`)을 붙인다. 문구는 `docs/finance-rules.md`와 일치시킨다.
