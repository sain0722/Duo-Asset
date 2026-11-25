-- 백업 복원
--
-- 설정 화면에서 내보낸 백업(JSON)으로 "현재 가구"의 재무 데이터를 통째로 교체한다.
--  * 한 트랜잭션에서 실행되므로 중간에 실패하면 아무것도 바뀌지 않는다.
--  * 모든 행의 household_id 를 호출자의 가구로 강제한다. 다른 가구에는 쓸 수 없다.
--  * 백업 속 구성원은 정렬 순서대로 현재 구성원에 대응시킨다 (새 프로젝트로 옮겨 복원하는 경우).

-- 백업 배열의 모든 행에 현재 가구 id 를 덮어쓴다 (없으면 빈 배열)
create function public.backup_rows(p_rows jsonb, p_household uuid)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_value || jsonb_build_object('household_id', p_household)), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) as t(row_value)
$$;

create function public.restore_backup(p_backup jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := (select public.current_household_id());
  v_text text;
  v_member record;
  v_current uuid;
  v_count int;
begin
  if v_household is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  if p_backup->>'app' is distinct from 'duoasset'
     or p_backup->>'formatVersion' is distinct from '1'
     or jsonb_typeof(p_backup->'members') is distinct from 'array' then
    raise exception 'invalid_backup' using errcode = '22023';
  end if;

  -- 마감·재개와 겹치지 않게 가구 단위로 직렬화하고, 닫힌 달의 행을 넣을 수 있게 표시한다 (touch_month 참고)
  perform 1 from public.households h where h.id = v_household for update;
  perform set_config('duoasset.restoring', 'on', true);

  select count(*) into v_count from public.members m where m.household_id = v_household;
  if jsonb_array_length(p_backup->'members') <> v_count then
    raise exception 'member_mismatch' using errcode = '22023';
  end if;

  -- 구성원 id 치환. 같은 가구의 백업이면(구성원 id 가 모두 그대로면) 건드리지 않는다.
  -- 다른 프로젝트에서 온 백업만 정렬 순서대로 현재 구성원에 대응시킨다:
  -- 백업 속 id → 자리표시자 → 현재 id (두 단계로 해야 서로 뒤바뀐 경우에도 안전하다)
  if exists (
    select 1 from jsonb_array_elements(p_backup->'members') b
    where not exists (
      select 1 from public.members m
      where m.household_id = v_household and m.id::text = b.value->>'id'
    )
  ) then
    v_text := p_backup::text;
    for v_member in
      select b.value->>'id' as old_id,
             row_number() over (order by (b.value->>'sort_order')::int, b.value->>'id') as rn
      from jsonb_array_elements(p_backup->'members') b
    loop
      v_text := replace(v_text, v_member.old_id, '@@member-' || v_member.rn || '@@');
    end loop;
    for v_member in
      select m.id, row_number() over (order by m.sort_order, m.id) as rn
      from public.members m
      where m.household_id = v_household
    loop
      v_text := replace(v_text, '@@member-' || v_member.rn || '@@', v_member.id::text);
    end loop;
    p_backup := v_text::jsonb;
  end if;

  -- 기존 데이터 삭제 (자식 → 부모 순)
  delete from public.goal_allocations where household_id = v_household;
  delete from public.goals where household_id = v_household;
  delete from public.future_events where household_id = v_household;
  delete from public.scenarios where household_id = v_household;
  delete from public.month_entries where household_id = v_household;
  delete from public.asset_snapshots where household_id = v_household;
  delete from public.liability_snapshots where household_id = v_household;
  delete from public.months where household_id = v_household;
  delete from public.plan_items where household_id = v_household;
  delete from public.liabilities where household_id = v_household;
  delete from public.assets where household_id = v_household;

  update public.households h
     set name = coalesce(nullif(btrim(p_backup->'household'->>'name'), ''), h.name)
   where h.id = v_household;

  -- 복원 (부모 → 자식 순). 모든 행의 household_id 는 현재 가구로 강제한다.
  insert into public.assets
  select * from jsonb_populate_recordset(null::public.assets, public.backup_rows(p_backup->'assets', v_household));

  insert into public.liabilities
  select * from jsonb_populate_recordset(null::public.liabilities, public.backup_rows(p_backup->'liabilities', v_household));

  insert into public.plan_items
  select * from jsonb_populate_recordset(null::public.plan_items, public.backup_rows(p_backup->'planItems', v_household));

  insert into public.months
  select * from jsonb_populate_recordset(null::public.months, public.backup_rows(p_backup->'months', v_household));

  insert into public.asset_snapshots
  select * from jsonb_populate_recordset(null::public.asset_snapshots, public.backup_rows(p_backup->'assetSnapshots', v_household));

  insert into public.liability_snapshots
  select * from jsonb_populate_recordset(null::public.liability_snapshots, public.backup_rows(p_backup->'liabilitySnapshots', v_household));

  insert into public.month_entries
  select * from jsonb_populate_recordset(null::public.month_entries, public.backup_rows(p_backup->'monthEntries', v_household));

  insert into public.goals
  select * from jsonb_populate_recordset(null::public.goals, public.backup_rows(p_backup->'goals', v_household));

  insert into public.goal_allocations
  select * from jsonb_populate_recordset(null::public.goal_allocations, public.backup_rows(p_backup->'goalAllocations', v_household));

  insert into public.scenarios
  select * from jsonb_populate_recordset(null::public.scenarios, public.backup_rows(p_backup->'scenarios', v_household));

  insert into public.future_events
  select * from jsonb_populate_recordset(null::public.future_events, public.backup_rows(p_backup->'events', v_household));

  -- 복원 결과가 앱의 전제를 지키는지 확인: 열린 달이 있고, 월이 빈칸 없이 이어지고, 닫힌 달은 앞쪽에 연속
  if not exists (select 1 from public.months m where m.household_id = v_household and m.status = 'open') then
    raise exception 'invalid_backup' using errcode = '22023';
  end if;
  if (
    select count(*) <> (
      (extract(year from max((m.month || '-01')::date)) - extract(year from min((m.month || '-01')::date))) * 12
      + extract(month from max((m.month || '-01')::date)) - extract(month from min((m.month || '-01')::date)) + 1
    )
    from public.months m where m.household_id = v_household
  ) then
    raise exception 'invalid_backup' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.months o
    join public.months c on c.household_id = o.household_id and c.month > o.month
    where o.household_id = v_household and o.status = 'open' and c.status = 'closed'
  ) then
    raise exception 'invalid_backup' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.backup_rows(jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.restore_backup(jsonb) from public, anon;
grant execute on function public.restore_backup(jsonb) to authenticated;
