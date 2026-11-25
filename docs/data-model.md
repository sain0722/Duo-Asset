# 데이터 구조

스키마는 `supabase/migrations/`에 있고, TypeScript 타입은 `src/lib/finance/types.ts`에 같은 컬럼명으로 있다.

## 공통 규칙

- 모든 테이블에 `household_id`가 있다. 넣을 때 생략하면 `current_household_id()`(로그인 사용자의 가구)로 채워진다.
- 자식 행은 `(household_id, 부모 id)` 복합 FK로 부모와 같은 가구임을 DB가 보장한다. 다른 가구의 자산·월을 가리키는 행은 만들 수 없다.
- 금액은 `bigint`(원), 월은 `ym` 도메인(`'YYYY-MM'`).
- 수정 가능한 행에는 `version`이 있다. 수정할 때 읽었던 `version`을 그대로 보내면 트리거가 일치 여부를 확인하고 1 올린다. 다르면 `40001 version_conflict`.
- "공동"은 `null`로 표현한다(`owner_member_id`, `payer_member_id`, `member_id`).

## 테이블

### 가구

| 테이블 | 설명 | 주요 컬럼 |
|--------|------|-----------|
| `households` | 가구 | `name` |
| `members` | 구성원 2명 | `user_id`(연결된 로그인 계정, 초대 중이면 null), `name`, `email`(초대·연결용) |

### 설정 (언제든 수정)

| 테이블 | 설명 | 주요 컬럼 |
|--------|------|-----------|
| `assets` | 자산 | `kind`, `owner_member_id`, `liquidity`, `maturity_date`, `is_active` |
| `liabilities` | 부채 | `kind`(상환 방식), `payer_member_id`, `original_principal`, `annual_rate`, `term_months`, `start_month`, `monthly_payment`, `withdraw_asset_id` |
| `plan_items` | 매월 반복되는 계획 | `kind`(income / benefit / expense / saving / contribution), `member_id`, `amount`, `income_type`, `pay_day`, `start_month`, `end_month`, `months_of_year`, `asset_id` |

- 자산의 **금액**은 `assets`에 없다. 월별 스냅샷에만 있고, "현재 값"은 가장 최근 달의 값이다.
- 부채 상환액은 `plan_items`에 두지 않는다. `liabilities`의 상환 방식에서 계산한다(이중 차감 방지).
- 지우는 대신 `is_active = false`로 보관한다. 과거 스냅샷이 있는 자산·부채는 FK 때문에 삭제되지 않는다.

`assets.kind`: `cash` 현금·입출금 / `deposit` 예금 / `savings` 적금 / `investment` 주식·투자 / `pension` 퇴직연금 / `real_estate` 부동산 / `lease_deposit` 임대보증금 / `presale` 분양 납부금 / `vehicle` 자동차 / `other`.
새 유형은 마이그레이션의 check 제약과 `src/lib/finance/meta.ts`의 `ASSET_KINDS`에 한 줄씩 추가하면 된다.

`liabilities.kind`: `installment` 무이자 할부 / `amortized` 원리금균등 / `equal_principal` 원금균등 / `bullet` 만기일시 / `interest_only` 원금 유지 차용금.

### 월별 기록

| 테이블 | 설명 | 주요 컬럼 |
|--------|------|-----------|
| `months` | 달 하나 | `month`, `status`(open / closed), `summary`(마감 시 동결한 `MonthReport`), `closed_at`, `closed_by` |
| `asset_snapshots` | 월말 자산 값 | `value`(평가금액), `principal`(누적 순투입액), `opening_value / opening_principal`(기존 보유분 뒤늦은 등록) |
| `liability_snapshots` | 월말 부채 값 | `balance`(남은 원금), `interest_paid`(실제 이자, null = 미확인), `opening_balance` |
| `month_entries` | 실제 금액 | `kind`(income / expense / contribution / transfer), `member_id`, `to_member_id`, `plan_item_id`, `amount` |

- 스냅샷·항목은 **행이 있으면 확인된 값, 없으면 미확인**이다. 0원은 `amount = 0`인 행이다.
- `months`는 직접 만들거나 상태를 바꿀 수 없다. 가구 생성 시 기준 월이 만들어지고, `close_month`가 다음 달을 연다.
- 닫힌 달은 항상 앞쪽에 연속이다: `closed, closed, …, open(, open)`.
- 마감된 달의 스냅샷·항목은 RLS가 insert/update/delete를 모두 거부한다.
- 스냅샷·항목이 바뀌면 트리거가 `months.version`을 올린다. 오래된 화면에서 계산한 결과로 마감하는 것을 막기 위해서다.

### 목표와 미래 계획

| 테이블 | 설명 | 주요 컬럼 |
|--------|------|-----------|
| `goals` | 목표 | `target_amount`, `target_date`, `basis`(linked / manual / net_worth / liquid_assets / financial_assets), `manual_amount`, `monthly_contribution` |
| `goal_allocations` | 목표 ↔ 자산 배정 | `amount`(null = 남은 전부) |
| `scenarios` | 시뮬레이션 시나리오 | `is_base`, `assumptions`(jsonb), `excluded_event_ids` |
| `future_events` | 미래 이벤트 | `scenario_id`(null = 공통), `kind`, `month`, `params`(jsonb) |

`assumptions`와 `params`의 형태는 `types.ts`의 `Assumptions`, `FutureEventParams`를 따른다.

## RPC

| 함수 | 용도 |
|------|------|
| `create_household(name, my_name, partner_name, partner_email, start_month)` | 첫 사용자가 가구·구성원 2명·기본 시나리오·기준 월을 만든다 |
| `claim_membership()` | 초대된 이메일로 로그인한 사용자를 구성원으로 연결한다 (이메일 인증된 계정만) |
| `close_month(month_id, summary, version)` | 가장 이른 열린 달을 마감하고 다음 달을 연다 |
| `reopen_month(month_id)` | 가장 최근에 마감한 달을 다시 연다 (`summary`는 남겨 계획을 유지) |
| `restore_backup(backup)` | 백업 파일로 현재 가구의 재무 데이터를 통째로 교체한다. 한 트랜잭션이며 모든 행을 호출자의 가구로 강제한다 |
| `ping()` | 무료 플랜 일시중지 방지용. 유일하게 비로그인 호출이 가능하며 데이터를 읽지 않는다 |

## 접근 권한

| 역할 | 권한 |
|------|------|
| `anon` (비로그인) | 테이블 권한 없음. `ping()`만 실행 가능 |
| `authenticated` | 자기 가구 행만 (RLS). `members`는 이름·이메일만, `months`는 메모만 수정 가능. 스냅샷·항목은 열린 달만 쓰기 가능 |
| `service_role` | 앱에서 쓰지 않는다 (테스트·시드 스크립트 전용) |

권한 검증은 `tests/db/`의 통합 테스트로 확인한다.
