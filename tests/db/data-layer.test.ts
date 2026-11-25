/**
 * 데이터 계층(lib/data)을 실제 로컬 Supabase 에 붙여 검증한다.
 * 가상 데이터 시드로 여러 달을 정산·마감한 뒤, 과거 데이터 보존과 동시 수정 처리를 확인한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_PASSWORD, seedDemo, type SeedResult } from "../../scripts/seed-demo";
import { currentPosition, history, lastClosedMonth, planForMonth, reportFor, workingMonth } from "@/lib/data/derive";
import { ConflictError } from "@/lib/data/errors";
import { closeMonth, insertRow, reopenMonth, saveAssetSnapshot, updateRow } from "@/lib/data/mutations";
import { exportBackup, fetchHousehold } from "@/lib/data/queries";
import { setSupabaseClient } from "@/lib/data/supabase";
import type { HouseholdData } from "@/lib/data/types";
import type { Asset, PlanItem } from "@/lib/finance/types";
import { adminClient, anonClient } from "./helpers";

let seed: SeedResult;
let owner: SupabaseClient;
let partner: SupabaseClient;

async function signIn(email: string): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw error;
  return client;
}

/** 지정한 사용자로 가구 데이터를 읽는다 */
async function loadAs(client: SupabaseClient): Promise<HouseholdData> {
  setSupabaseClient(client);
  const data = await fetchHousehold();
  if (!data) throw new Error("가구 없음");
  return data;
}

beforeAll(async () => {
  seed = await seedDemo({ closedMonths: 3, quiet: true });
  owner = await signIn(seed.ownerEmail);
  partner = await signIn(seed.partnerEmail);
});

afterAll(async () => {
  setSupabaseClient(undefined);
  const admin = adminClient();
  const { data: members } = await admin.from("members").select("user_id").eq("household_id", seed.householdId);
  await admin.from("households").delete().eq("id", seed.householdId);
  for (const member of members ?? []) {
    if (member.user_id) await admin.auth.admin.deleteUser(member.user_id);
  }
});

describe("가구 데이터 읽기", () => {
  it("부부가 같은 데이터를 읽는다", async () => {
    const mine = await loadAs(owner);
    const theirs = await loadAs(partner);
    expect(mine.me.name).toBe("하늘");
    expect(theirs.me.name).toBe("바다");
    expect(theirs.household.id).toBe(mine.household.id);
    expect(theirs.assets.map((a) => a.id)).toEqual(mine.assets.map((a) => a.id));
    expect(mine.months.map((m) => m.status)).toEqual(["closed", "closed", "closed", "closed", "open"]);
  });

  it("가구가 없는 사용자는 null 을 받는다", async () => {
    const admin = adminClient();
    const email = `nobody-${Date.now()}@example.com`;
    const created = await admin.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true });
    setSupabaseClient(await signIn(email));
    expect(await fetchHousehold()).toBeNull();
    await admin.auth.admin.deleteUser(created.data.user!.id);
  });

  it("월별 입력 행은 열린 달만 읽고, 마감된 달은 동결된 결과를 쓴다", async () => {
    const data = await loadAs(owner);
    const open = workingMonth(data)!;
    expect(Object.keys(data.monthData)).toEqual([open.id]);
    for (const point of history(data)) {
      expect(point.report.month).toBe(point.month);
    }
    // 월초 값은 직전 달 마감 결과와 이어진다
    const closed = lastClosedMonth(data)!;
    expect(reportFor(data, open).opening.netWorth).toBe(closed.summary!.closing.netWorth);
  });

  it("백업은 마감된 달의 입력 행까지 모두 담는다", async () => {
    const data = await loadAs(owner);
    const backup = await exportBackup();
    expect(backup.months).toHaveLength(data.months.length);
    expect(backup.assets).toHaveLength(data.assets.length);
    // 기준 월 + 마감 3개월 × 자산 11개 + 진행 중인 달 2개
    expect(backup.assetSnapshots).toHaveLength(4 * 11 + 2);
    expect(backup.monthEntries.length).toBeGreaterThan(0);
  });
});

describe("과거 확정 데이터 보존", () => {
  it("설정을 바꿔도 마감된 달의 결과와 다음 달의 월초 값은 변하지 않는다", async () => {
    const before = await loadAs(owner);
    const closedBefore = before.months.filter((m) => m.status === "closed").map((m) => m.summary);
    const openingBefore = reportFor(before, workingMonth(before)!).opening;

    // 자산 이름·종류·소유자를 바꾸고, 급여 계획을 올리고, 새 지출 항목을 추가한다
    const stock = before.assets.find((a) => a.kind === "investment")!;
    await updateRow<Asset>("assets", stock, { name: "이름 바꾼 계좌", kind: "other", owner_member_id: null });
    const salary = before.planItems.find((p) => p.kind === "income" && p.income_type === "salary")!;
    await updateRow<PlanItem>("plan_items", salary, { amount: salary.amount + 1_000_000 });
    await insertRow<PlanItem>("plan_items", { kind: "expense", name: "새 구독", amount: 50_000, member_id: null });

    const after = await loadAs(owner);
    expect(after.months.filter((m) => m.status === "closed").map((m) => m.summary)).toEqual(closedBefore);
    for (const month of after.months.filter((m) => m.status === "closed")) {
      expect(reportFor(after, month)).toBe(month.summary);
    }
    expect(reportFor(after, workingMonth(after)!).opening.netWorth).toBe(openingBefore.netWorth);

    // 반면 열린 달의 계획은 새 설정을 따른다
    const openPlan = planForMonth(after, workingMonth(after)!.month);
    const closedPlan = lastClosedMonth(after)!.summary!.plan;
    expect(openPlan.totals.income).toBe(closedPlan.income + 1_000_000);
  });

  it("마감된 달을 다시 열어도 계획은 마감 당시 값을 유지하고, 다시 마감하면 다음 달 월초가 따라온다", async () => {
    let data = await loadAs(owner);
    const closed = lastClosedMonth(data)!;
    const frozenPlan = closed.summary!.plan;

    await reopenMonth(closed);
    data = await loadAs(owner);
    const reopened = data.months.find((m) => m.id === closed.id)!;
    expect(reopened.status).toBe("open");
    expect(workingMonth(data)!.id).toBe(reopened.id);
    // 급여 계획을 올렸지만 다시 연 달의 계획은 그대로
    expect(reportFor(data, reopened).plan).toEqual(frozenPlan);

    // 다시 연 달의 통장 잔액을 100만 원 올려 고친다
    const account = data.assets.find((a) => a.name === "하늘 급여통장")!;
    const snapshot = data.monthData[reopened.id].assetSnapshots.find((s) => s.asset_id === account.id)!;
    await saveAssetSnapshot(reopened.id, account.id, snapshot, {
      value: snapshot.value + 1_000_000,
      principal: snapshot.principal + 1_000_000,
    });

    data = await loadAs(owner);
    const fixed = data.months.find((m) => m.id === closed.id)!;
    const report = reportFor(data, fixed);
    expect(report.complete).toBe(true);
    expect(report.closing.netWorth).toBe(closed.summary!.closing.netWorth + 1_000_000);
    await closeMonth(fixed, report);

    data = await loadAs(owner);
    expect(lastClosedMonth(data)!.summary!.closing.netWorth).toBe(report.closing.netWorth);
    expect(reportFor(data, workingMonth(data)!).opening.netWorth).toBe(report.closing.netWorth);
  });
});

describe("동시 수정", () => {
  it("배우자가 먼저 고친 행을 오래된 버전으로 고치면 ConflictError", async () => {
    const mine = await loadAs(owner);
    const asset = mine.assets.find((a) => a.name === "공용통장")!;

    setSupabaseClient(partner);
    await updateRow<Asset>("assets", asset, { memo: "배우자 메모" });

    setSupabaseClient(owner);
    await expect(updateRow<Asset>("assets", asset, { memo: "내 메모" })).rejects.toBeInstanceOf(ConflictError);

    const latest = await loadAs(owner);
    const current = latest.assets.find((a) => a.id === asset.id)!;
    expect(current.memo).toBe("배우자 메모");
    await expect(updateRow<Asset>("assets", current, { memo: "내 메모" })).resolves.toMatchObject({ memo: "내 메모" });
  });

  it("같은 자산의 잔액을 둘이 동시에 처음 입력하면 한쪽은 충돌로 알린다", async () => {
    const data = await loadAs(owner);
    const open = workingMonth(data)!;
    const confirmed = new Set(data.monthData[open.id].assetSnapshots.map((s) => s.asset_id));
    const asset = data.assets.find((a) => !confirmed.has(a.id))!;

    setSupabaseClient(partner);
    await saveAssetSnapshot(open.id, asset.id, undefined, { value: 1_000, principal: 1_000 });
    setSupabaseClient(owner);
    await expect(saveAssetSnapshot(open.id, asset.id, undefined, { value: 2_000, principal: 2_000 })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(currentPosition(await loadAs(owner)).assetValues[asset.id]).toBe(1_000);
  });

  it("배우자가 입력을 바꾼 뒤에는 오래된 화면의 결과로 마감할 수 없다", async () => {
    const stale = await loadAs(owner);
    const open = workingMonth(stale)!;
    const staleReport = reportFor(stale, open);

    setSupabaseClient(partner);
    const theirs = await loadAs(partner);
    const snapshot = theirs.monthData[open.id].assetSnapshots[0];
    await saveAssetSnapshot(open.id, snapshot.asset_id, snapshot, { value: snapshot.value + 1, principal: snapshot.principal + 1 });

    setSupabaseClient(owner);
    await expect(closeMonth(open, staleReport)).rejects.toBeInstanceOf(ConflictError);
    expect(workingMonth(await loadAs(owner))!.id).toBe(open.id);
  });
});
