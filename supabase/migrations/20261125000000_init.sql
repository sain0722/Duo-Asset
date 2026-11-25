-- DuoAsset 초기 스키마
-- 원칙
--  * 모든 금액은 KRW 원 단위 정수(bigint). 부동소수점 금지.
--  * 모든 테이블은 household_id 를 가지며 RLS 로 "같은 가구 구성원만" 접근한다.
--  * 자식 행은 (household_id, parent_id) 복합 FK 로 부모와 같은 가구임을 DB 가 보장한다.
--  * 마감된 월(months.status = 'closed')의 스냅샷/항목은 DB 수준에서 수정 불가.
--  * 낙관적 잠금: version 컬럼 + 트리거. 오래된 version 으로 갱신하면 40001 오류.

-- ───────────────────────── 공통 ─────────────────────────

create domain public.ym as text
  check (value ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

comment on domain public.ym is '월 키. YYYY-MM (Asia/Seoul 기준)';

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 50),
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  -- 로그인 계정. 아직 연결되지 않은 배우자는 null (email 로 초대된 상태)
  user_id uuid unique references auth.users (id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 30),
  email text check (email = lower(email)),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, id)
);

create unique index members_email_key on public.members (email) where email is not null;
create index members_household_idx on public.members (household_id);

-- 현재 로그인 사용자의 가구. RLS 정책의 기준점.
create function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id
  from public.members m
  where m.user_id = (select auth.uid())
  limit 1
$$;

-- 낙관적 잠금: 클라이언트는 읽었던 version 을 그대로 보내고, 서버가 +1 한다.
create function public.bump_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is distinct from old.version then
    raise exception 'version_conflict'
      using errcode = '40001',
            hint = '다른 기기에서 먼저 수정되었습니다. 새로고침 후 다시 시도하세요.';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

-- ───────────────────────── 설정: 자산 / 부채 / 반복 항목 ─────────────────────────

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  kind text not null check (kind in (
    'cash',          -- 현금·입출금 통장
    'deposit',       -- 예금
    'savings',       -- 적금 (계 모임을 자산으로 볼 때 포함)
    'investment',    -- 주식·펀드 등 투자자산
    'pension',       -- 퇴직연금·연금저축
    'real_estate',   -- 부동산
    'lease_deposit', -- 임대보증금 (전·월세 보증금)
    'presale',       -- 분양 납부금
    'vehicle',       -- 자동차
    'other'
  )),
  -- null = 공동 자산
  owner_member_id uuid,
  liquidity text not null check (liquidity in ('liquid', 'short', 'locked')),
  maturity_date date,
  memo text not null default '',
  is_active boolean not null default true,
  sort_order int not null default 0,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, owner_member_id) references public.members (household_id, id)
);

create index assets_household_idx on public.assets (household_id);

create table public.liabilities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  kind text not null check (kind in (
    'installment',     -- 무이자 할부: 매월 고정 원금
    'amortized',       -- 원리금균등
    'equal_principal', -- 원금균등
    'bullet',          -- 만기일시상환 (매월 이자, 만기에 원금)
    'interest_only'    -- 원금 상환 계획 없는 차용금 (매월 일정액 지급, 원금 유지)
  )),
  -- null = 공용통장에서 납부
  payer_member_id uuid,
  -- 원금이 없는 정기 지급은 부채가 아니라 고정지출(plan_items)로 등록한다
  original_principal bigint not null check (original_principal > 0),
  annual_rate numeric(6, 3) not null default 0 check (annual_rate >= 0 and annual_rate < 100),
  term_months int check (term_months > 0),
  start_month public.ym,           -- 첫 납부 월
  monthly_payment bigint check (monthly_payment >= 0), -- installment: 월 원금, interest_only: 월 지급액
  payment_day int check (payment_day between 1 and 31),
  withdraw_asset_id uuid,          -- 출금 계좌 (정보용)
  memo text not null default '',
  is_active boolean not null default true,
  sort_order int not null default 0,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, payer_member_id) references public.members (household_id, id),
  foreign key (household_id, withdraw_asset_id) references public.assets (household_id, id)
);

create index liabilities_household_idx on public.liabilities (household_id);

-- 매월 반복되는 계획 항목 (수입 / 비현금 복지 / 고정지출 / 저축 / 공용통장 납입)
-- 부채 상환액은 여기 두지 않는다. liabilities 에서 파생시켜 중복 집계를 막는다.
create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households (id) on delete cascade,
  kind text not null check (kind in ('income', 'benefit', 'expense', 'saving', 'contribution')),
  -- null = 공동(공용통장) 항목
  member_id uuid,
  name text not null check (length(btrim(name)) between 1 and 60),
  amount bigint not null check (amount >= 0),
  income_type text check (income_type in ('salary', 'bonus', 'other')),
  pay_day int check (pay_day between 1 and 31),
  start_month public.ym,           -- null = 처음부터
  end_month public.ym,             -- null = 계속
  months_of_year int[] check (months_of_year <@ array[1,2,3,4,5,6,7,8,9,10,11,12]), -- null = 매월
  asset_id uuid,                   -- saving: 납입 대상 자산 (선택)
  memo text not null default '',
  is_active boolean not null default true,
  sort_order int not null default 0,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, member_id) references public.members (household_id, id),
  foreign key (household_id, asset_id) references public.assets (household_id, id),
  check (start_month is null or end_month is null or start_month <= end_month),
  check (kind <> 'contribution' or member_id is not null),
  check (kind <> 'benefit' or member_id is not null),
  check ((kind = 'income') = (income_type is not null))
);

create index plan_items_household_idx on public.plan_items (household_id);

-- ───────────────────────── 월별 기록 ─────────────────────────

create table public.months (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households (id) on delete cascade,
  month public.ym not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  -- 마감 시점에 확정한 정산 결과(MonthReport). 마감된 달은 이 값만 신뢰한다.
  summary jsonb,
  note text not null default '',
  closed_at timestamptz,
  closed_by uuid,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, month),
  unique (household_id, id),
  foreign key (household_id, closed_by) references public.members (household_id, id),
  check ((status = 'closed') = (closed_at is not null)),
  check (status = 'open' or summary is not null)
);

-- 월말 자산 스냅샷. 행이 있다 = 사용자가 확인한 값. 행이 없다 = 미확인.
create table public.asset_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households (id) on delete cascade,
  month_id uuid not null,
  asset_id uuid not null,
  value bigint not null,      -- 월말 평가금액
  principal bigint not null,  -- 누적 순투입액(투자원금·취득금액). 현금성 자산은 value 와 같다.
  -- 직전 달 스냅샷이 없는 "기존 보유 자산"의 월초 값. 수입·저축 계산에서 제외(기초 조정)하기 위함.
  opening_value bigint,
  opening_principal bigint,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month_id, asset_id),
  foreign key (household_id, month_id) references public.months (household_id, id) on delete cascade,
  foreign key (household_id, asset_id) references public.assets (household_id, id),
  check ((opening_value is null) = (opening_principal is null))
);

create index asset_snapshots_asset_idx on public.asset_snapshots (asset_id);

-- 월말 부채 스냅샷.
create table public.liability_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households (id) on delete cascade,
  month_id uuid not null,
  liability_id uuid not null,
  balance bigint not null check (balance >= 0), -- 월말 남은 원금
  interest_paid bigint check (interest_paid >= 0), -- 이번 달 실제 이자·비원금 지급액. null = 미확인
  opening_balance bigint check (opening_balance >= 0), -- 기존 보유 부채의 월초 잔액 (기초 조정)
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month_id, liability_id),
  foreign key (household_id, month_id) references public.months (household_id, id) on delete cascade,
  foreign key (household_id, liability_id) references public.liabilities (household_id, id)
);

create index liability_snapshots_liability_idx on public.liability_snapshots (liability_id);

-- 월별 실제 금액. 행이 없다 = 미확인, amount = 0 = 실제 0원.
--  income       : member_id 가 받은 실제 현금 수입 (null = 공동 수입)
--  expense      : member_id 주머니에서 나간 것으로 확인된 지출 (null = 공용통장). 소비의 "분류"일 뿐 총액은 잔액에서 도출된다.
--  contribution : member_id → 공용통장 실제 입금액
--  transfer     : member_id(보낸 쪽, null = 공용) → to_member_id(받는 쪽, null = 공용) 주머니 간 이동
create table public.month_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households (id) on delete cascade,
  month_id uuid not null,
  kind text not null check (kind in ('income', 'expense', 'contribution', 'transfer')),
  member_id uuid,
  to_member_id uuid,
  plan_item_id uuid,               -- 계획 항목에서 온 줄이면 그 id (추가 항목은 null)
  name text not null check (length(btrim(name)) between 1 and 60),
  amount bigint not null check (amount >= 0),
  memo text not null default '',
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, month_id) references public.months (household_id, id) on delete cascade,
  foreign key (household_id, member_id) references public.members (household_id, id),
  foreign key (household_id, to_member_id) references public.members (household_id, id),
  -- 실제 값이 연결된 계획 항목은 삭제할 수 없다 (종료·비활성화만). 다시 연 달의 계획 줄과 짝이 끊기지 않게 한다.
  foreign key (household_id, plan_item_id) references public.plan_items (household_id, id),
  check (kind <> 'contribution' or member_id is not null),
  check (kind = 'transfer' or to_member_id is null),
  check (kind <> 'transfer' or member_id is distinct from to_member_id)
);

create unique index month_entries_plan_item_key
  on public.month_entries (month_id, plan_item_id) where plan_item_id is not null;
create index month_entries_month_idx on public.month_entries (month_id);

-- ───────────────────────── 목표 / 미래 계획 ─────────────────────────

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  target_amount bigint not null check (target_amount > 0),
  target_date date,
  -- 현재 확보 금액을 무엇으로 볼지
  basis text not null default 'linked' check (basis in (
    'linked',           -- 연결한 자산의 배정액 합
    'manual',           -- 직접 입력
    'net_worth',        -- 순자산
    'liquid_assets',    -- 가용자산(즉시 사용 가능)
    'financial_assets'  -- 금융자산 합계
  )),
  manual_amount bigint check (manual_amount >= 0),
  monthly_contribution bigint check (monthly_contribution >= 0),
  memo text not null default '',
  is_archived boolean not null default false,
  sort_order int not null default 0,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);

create index goals_household_idx on public.goals (household_id);

-- 목표에 자산을 배정한다. amount = null 이면 "남은 금액 전부".
-- 한 자산이 여러 목표에 배정돼도 합계가 자산 평가금액을 넘지 않도록 계산 로직에서 순서대로 차감한다.
create table public.goal_allocations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households (id) on delete cascade,
  goal_id uuid not null,
  asset_id uuid not null,
  amount bigint check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (goal_id, asset_id),
  foreign key (household_id, goal_id) references public.goals (household_id, id) on delete cascade,
  foreign key (household_id, asset_id) references public.assets (household_id, id) on delete cascade
);

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  is_base boolean not null default false,
  assumptions jsonb not null default '{}'::jsonb,
  -- 이 시나리오에서 끈 공통 이벤트
  excluded_event_ids uuid[] not null default '{}',
  sort_order int not null default 0,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);

create unique index scenarios_one_base_key on public.scenarios (household_id) where is_base;

create table public.future_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_household_id()
    references public.households (id) on delete cascade,
  -- null = 모든 시나리오 공통, 값이 있으면 그 시나리오 전용
  scenario_id uuid,
  name text not null check (length(btrim(name)) between 1 and 60),
  kind text not null check (kind in (
    'income_change', 'expense_change', 'one_time', 'loan', 'home_move_in', 'parental_leave'
  )),
  month public.ym not null,
  params jsonb not null default '{}'::jsonb,
  memo text not null default '',
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, scenario_id) references public.scenarios (household_id, id) on delete cascade
);

create index future_events_household_idx on public.future_events (household_id);

-- ───────────────────────── 트리거 ─────────────────────────

create trigger bump_version before update on public.assets
  for each row execute function public.bump_version();
create trigger bump_version before update on public.liabilities
  for each row execute function public.bump_version();
create trigger bump_version before update on public.plan_items
  for each row execute function public.bump_version();
create trigger bump_version before update on public.months
  for each row execute function public.bump_version();
create trigger bump_version before update on public.asset_snapshots
  for each row execute function public.bump_version();
create trigger bump_version before update on public.liability_snapshots
  for each row execute function public.bump_version();
create trigger bump_version before update on public.month_entries
  for each row execute function public.bump_version();
create trigger bump_version before update on public.goals
  for each row execute function public.bump_version();
create trigger bump_version before update on public.scenarios
  for each row execute function public.bump_version();
create trigger bump_version before update on public.future_events
  for each row execute function public.bump_version();

-- 월의 입력값이 바뀌면 months.version 을 올린다.
-- → 다른 기기에서 오래된 화면을 보고 계산한 결과로 월을 마감하는 것을 막는다.
create function public.touch_month()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.months
     set updated_at = now()
   where id = coalesce(new.month_id, old.month_id);
  return null;
end;
$$;

create trigger touch_month after insert or update or delete on public.asset_snapshots
  for each row execute function public.touch_month();
create trigger touch_month after insert or update or delete on public.liability_snapshots
  for each row execute function public.touch_month();
create trigger touch_month after insert or update or delete on public.month_entries
  for each row execute function public.touch_month();

-- ───────────────────────── RLS ─────────────────────────

create function public.month_is_open(p_month_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.months m
    where m.id = p_month_id
      and m.status = 'open'
      and m.household_id = (select public.current_household_id())
  )
$$;

alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.assets enable row level security;
alter table public.liabilities enable row level security;
alter table public.plan_items enable row level security;
alter table public.months enable row level security;
alter table public.asset_snapshots enable row level security;
alter table public.liability_snapshots enable row level security;
alter table public.month_entries enable row level security;
alter table public.goals enable row level security;
alter table public.goal_allocations enable row level security;
alter table public.scenarios enable row level security;
alter table public.future_events enable row level security;

-- 가구 / 구성원: 조회와 이름 수정만. 생성·연결은 RPC 로만 한다.
create policy household_select on public.households for select to authenticated
  using (id = (select public.current_household_id()));
create policy household_update on public.households for update to authenticated
  using (id = (select public.current_household_id()))
  with check (id = (select public.current_household_id()));

create policy members_select on public.members for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy members_update on public.members for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));

-- 가구 단위 설정 테이블: 같은 가구면 모두 가능
create policy household_all on public.assets for all to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy household_all on public.liabilities for all to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy household_all on public.plan_items for all to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy household_all on public.goals for all to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy household_all on public.goal_allocations for all to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy household_all on public.scenarios for all to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy household_all on public.future_events for all to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));

-- 월: 조회 + 메모 수정만. 생성·마감·재개는 RPC 로만 한다.
create policy months_select on public.months for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy months_update on public.months for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));

-- 월별 입력: 조회는 항상, 쓰기는 열린 달만
create policy snap_select on public.asset_snapshots for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy snap_insert on public.asset_snapshots for insert to authenticated
  with check (household_id = (select public.current_household_id()) and public.month_is_open(month_id));
create policy snap_update on public.asset_snapshots for update to authenticated
  using (household_id = (select public.current_household_id()) and public.month_is_open(month_id))
  with check (household_id = (select public.current_household_id()) and public.month_is_open(month_id));
create policy snap_delete on public.asset_snapshots for delete to authenticated
  using (household_id = (select public.current_household_id()) and public.month_is_open(month_id));

create policy snap_select on public.liability_snapshots for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy snap_insert on public.liability_snapshots for insert to authenticated
  with check (household_id = (select public.current_household_id()) and public.month_is_open(month_id));
create policy snap_update on public.liability_snapshots for update to authenticated
  using (household_id = (select public.current_household_id()) and public.month_is_open(month_id))
  with check (household_id = (select public.current_household_id()) and public.month_is_open(month_id));
create policy snap_delete on public.liability_snapshots for delete to authenticated
  using (household_id = (select public.current_household_id()) and public.month_is_open(month_id));

create policy entry_select on public.month_entries for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy entry_insert on public.month_entries for insert to authenticated
  with check (household_id = (select public.current_household_id()) and public.month_is_open(month_id));
create policy entry_update on public.month_entries for update to authenticated
  using (household_id = (select public.current_household_id()) and public.month_is_open(month_id))
  with check (household_id = (select public.current_household_id()) and public.month_is_open(month_id));
create policy entry_delete on public.month_entries for delete to authenticated
  using (household_id = (select public.current_household_id()) and public.month_is_open(month_id));

-- ───────────────────────── 권한 (테이블/컬럼) ─────────────────────────
-- anon 에게는 아무 권한도 주지 않는다. authenticated 에게도 필요한 것만 준다.

revoke all on all tables in schema public from anon, authenticated;

grant select on public.households to authenticated;
grant update (name) on public.households to authenticated;

grant select on public.members to authenticated;
grant update (name, email, sort_order) on public.members to authenticated;

grant select, insert, update, delete
  on public.assets, public.liabilities, public.plan_items,
     public.goals, public.goal_allocations, public.scenarios, public.future_events
  to authenticated;

grant select on public.months to authenticated;
grant update (note, version) on public.months to authenticated;

grant select, insert, delete on public.asset_snapshots to authenticated;
grant update (value, principal, opening_value, opening_principal, version)
  on public.asset_snapshots to authenticated;

grant select, insert, delete on public.liability_snapshots to authenticated;
grant update (balance, interest_paid, opening_balance, version)
  on public.liability_snapshots to authenticated;

grant select, insert, delete on public.month_entries to authenticated;
grant update (member_id, to_member_id, name, amount, memo, version)
  on public.month_entries to authenticated;

-- ───────────────────────── RPC ─────────────────────────

-- 초대된 이메일로 로그인한 사용자를 가구 구성원으로 연결한다.
create function public.claim_membership()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_household uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select m.household_id into v_household from public.members m where m.user_id = v_uid;
  if v_household is not null then
    return v_household;
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then
    return null;
  end if;

  update public.members m
     set user_id = v_uid
   where m.email = v_email and m.user_id is null
  returning m.household_id into v_household;

  return v_household;
end;
$$;

-- 첫 사용자가 가구를 만든다. 본인 + 배우자 구성원, 기본 시나리오, 기준 월을 함께 생성.
create function public.create_household(
  p_household_name text,
  p_my_name text,
  p_partner_name text,
  p_partner_email text,
  p_start_month public.ym
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_household uuid;
  v_partner_email text := nullif(lower(btrim(coalesce(p_partner_email, ''))), '');
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.members m where m.user_id = v_uid) then
    raise exception 'already_member' using errcode = '23505';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if v_partner_email is not null and v_partner_email = v_email then
    raise exception 'partner_email_same_as_mine' using errcode = '22023';
  end if;
  -- 내 이메일로 이미 초대가 걸려 있으면 새 가구를 만들 수 없다 (claim_membership 을 써야 한다)
  if exists (select 1 from public.members m where m.email = v_email) then
    raise exception 'already_invited' using errcode = '23505';
  end if;

  insert into public.households (name) values (btrim(p_household_name))
  returning id into v_household;

  insert into public.members (household_id, user_id, name, email, sort_order)
  values (v_household, v_uid, btrim(p_my_name), v_email, 0);

  insert into public.members (household_id, user_id, name, email, sort_order)
  values (v_household, null, btrim(p_partner_name), v_partner_email, 1);

  insert into public.scenarios (household_id, name, is_base) values (v_household, '기본 계획', true);

  insert into public.months (household_id, month) values (v_household, p_start_month);

  return v_household;
end;
$$;

-- 월 마감. 가장 이른 열린 달만 마감할 수 있고, 마감하면 다음 달이 열린다.
create function public.close_month(p_month_id uuid, p_summary jsonb, p_version int)
returns public.months
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := (select public.current_household_id());
  v_month public.months;
  v_next text;
begin
  if v_household is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  if p_summary is null or jsonb_typeof(p_summary) <> 'object' then
    raise exception 'summary_required' using errcode = '22023';
  end if;

  select * into v_month from public.months m
   where m.id = p_month_id and m.household_id = v_household
     for update;
  if not found then
    raise exception 'month_not_found' using errcode = 'P0002';
  end if;
  if v_month.status <> 'open' then
    raise exception 'month_not_open' using errcode = '55000';
  end if;
  if v_month.version <> p_version then
    raise exception 'version_conflict' using errcode = '40001';
  end if;
  if exists (
    select 1 from public.months m
     where m.household_id = v_household and m.month < v_month.month and m.status = 'open'
  ) then
    raise exception 'earlier_month_open' using errcode = '55000';
  end if;

  update public.months m
     set status = 'closed',
         summary = p_summary,
         closed_at = now(),
         closed_by = (select mm.id from public.members mm where mm.user_id = (select auth.uid()))
   where m.id = p_month_id
  returning * into v_month;

  v_next := to_char((v_month.month || '-01')::date + interval '1 month', 'YYYY-MM');
  insert into public.months (household_id, month)
  values (v_household, v_next)
  on conflict (household_id, month) do nothing;

  return v_month;
end;
$$;

-- 마감 취소. 가장 최근에 마감한 달만 다시 열 수 있다 (닫힌 달은 항상 앞쪽에 연속).
create function public.reopen_month(p_month_id uuid)
returns public.months
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := (select public.current_household_id());
  v_month public.months;
begin
  if v_household is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  select * into v_month from public.months m
   where m.id = p_month_id and m.household_id = v_household
     for update;
  if not found then
    raise exception 'month_not_found' using errcode = 'P0002';
  end if;
  if v_month.status <> 'closed' then
    raise exception 'month_not_closed' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.months m
     where m.household_id = v_household and m.month > v_month.month and m.status = 'closed'
  ) then
    raise exception 'later_month_closed' using errcode = '55000';
  end if;

  -- summary 는 남겨 둔다: 다시 열린 달의 "계획"은 마감 당시 값을 그대로 쓴다.
  update public.months m
     set status = 'open', closed_at = null, closed_by = null
   where m.id = p_month_id
  returning * into v_month;

  return v_month;
end;
$$;

-- 무료 플랜 프로젝트가 장기간 미사용으로 일시중지되지 않도록 하는 가벼운 호출용.
create function public.ping()
returns text
language sql
stable
set search_path = ''
as $$ select 'ok' $$;

-- 함수 실행 권한: 기본 PUBLIC 권한을 걷어내고 필요한 역할에만 준다.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.current_household_id() to authenticated;
grant execute on function public.month_is_open(uuid) to authenticated;
grant execute on function public.claim_membership() to authenticated;
grant execute on function public.create_household(text, text, text, text, public.ym) to authenticated;
grant execute on function public.close_month(uuid, jsonb, int) to authenticated;
grant execute on function public.reopen_month(uuid) to authenticated;
grant execute on function public.ping() to anon, authenticated;
