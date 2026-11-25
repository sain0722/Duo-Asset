/**
 * 데이터 계층(lib/data)을 실제 로컬 Supabase 에 붙여 검증한다.
 * 가상 데이터 시드로 여러 달을 정산·마감한 뒤, 과거 데이터 보존과 동시 수정 처리를 확인한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_PASSWORD, seedDemo, type SeedResult } from "../../scripts/seed-demo";
import { currentPosition, history, lastClosedMonth, planForMonth, reportFor, workingMonth } from "@/lib/data/derive";
import { ConflictError } from "@/lib/data/errors";
import {
  closeMonth,
  createAssetWithSnapshot,
  deleteRow,
  insertRow,
  reopenMonth,
  restoreBackup,
  saveAssetSnapshot,
  saveEntry,
  saveMonthInputs,
  saveLiabilitySnapshot,
  updateRow,
} from "@/lib/data/mutations";
import { exportBackup, fetchHousehold } from "@/lib/data/queries";
import { setSupabaseClient } from "@/lib/data/supabase";
import type { HouseholdData } from "@/lib/data/types";
import { memberIdOf } from "@/lib/finance/meta";
import { suggestInputs } from "@/lib/finance/suggest";
import { currentYm } from "@/lib/month";
import type { Asset, Goal, PlanItem } from "@/lib/finance/types";
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
    // 먼저 이번 달의 미확인 항목을 모두 확인해 마감할 수 있는 상태로 만든다
    let data = await loadAs(owner);
    const open = workingMonth(data)!;
    const pending = reportFor(data, open);
    await Promise.all([
      ...pending.assetLines
        .filter((line) => !line.confirmed)
        .map((line) => saveAssetSnapshot(open.id, line.assetId, undefined, { value: line.value, principal: line.principal })),
      ...pending.liabilityLines
        .filter((line) => !line.confirmed)
        .map((line) => saveLiabilitySnapshot(open.id, line.liabilityId, undefined, { balance: line.balance })),
      ...[...pending.incomeLines.map((line) => ({ line, kind: "income" as const })), ...pending.contributionLines.map((line) => ({ line, kind: "contribution" as const }))]
        .filter(({ line }) => line.actual === null)
        .map(({ line, kind }) =>
          saveEntry(open.id, undefined, {
            kind,
            member_id: memberIdOf(line.pocket),
            plan_item_id: line.key,
            name: line.name,
            amount: line.planned ?? 0,
          }),
        ),
    ]);
    data = await loadAs(owner);
    const stale = workingMonth(data)!;
    const staleReport = reportFor(data, stale);
    expect(staleReport.complete).toBe(true);

    // 그 사이 배우자가 잔액 하나를 고쳤다
    const theirs = await loadAs(partner);
    const snapshot = theirs.monthData[open.id].assetSnapshots[0];
    await saveAssetSnapshot(open.id, snapshot.asset_id, snapshot, { value: snapshot.value + 1, principal: snapshot.principal + 1 });

    setSupabaseClient(owner);
    await expect(closeMonth(stale, staleReport)).rejects.toBeInstanceOf(ConflictError);
    const latest = await loadAs(owner);
    expect(workingMonth(latest)!.id).toBe(open.id);

    // 최신 값을 다시 읽으면 마감된다
    const fresh = workingMonth(latest)!;
    await expect(closeMonth(fresh, reportFor(latest, fresh))).resolves.toMatchObject({ status: "closed" });
    expect(workingMonth(await loadAs(owner))!.month > open.month).toBe(true);
  });

  it("아직 끝나지 않은 달은 마감할 수 없다 (스냅샷은 월말 잔액이다)", async () => {
    // 위에서 지난달을 마감해 이번 달이 열렸다. 모든 항목을 확인해도 달이 끝나기 전에는 마감되지 않는다.
    let data = await loadAs(owner);
    const open = workingMonth(data)!;
    expect(open.month).toBe(currentYm());
    const suggested = suggestInputs(reportFor(data, open));
    await saveMonthInputs(open.id, {
      assetSnapshots: reportFor(data, open)
        .assetLines.filter((line) => !line.confirmed)
        .map((line) => ({ asset_id: line.assetId, value: line.value, principal: line.principal })),
      liabilitySnapshots: suggested.liabilities.map((l) => ({
        liability_id: l.liabilityId,
        balance: l.balance,
        interest_paid: l.interestPaid,
      })),
      entries: suggested.entries.map((e) => ({
        kind: e.kind,
        member_id: e.memberId,
        plan_item_id: e.planItemId,
        name: e.name,
        amount: e.amount,
      })),
    });
    data = await loadAs(owner);
    const complete = workingMonth(data)!;
    const report = reportFor(data, complete);
    expect(report.complete).toBe(true);

    await expect(closeMonth(complete, report)).rejects.toThrow("아직 끝나지 않은 달");
    // 클라이언트 검사를 건너뛰어도 DB 가 막는다
    const direct = await owner.rpc("close_month", { p_month_id: complete.id, p_summary: report, p_version: complete.version });
    expect(direct.error?.message).toContain("month_not_ended");
    expect(workingMonth(await loadAs(owner))!.id).toBe(complete.id);

    // 이후 테스트를 위해 확인을 되돌려 "정산 전" 상태로 만든다
    const rows = (await loadAs(owner)).monthData[complete.id];
    await Promise.all([
      ...rows.assetSnapshots.map((s) => deleteRow("asset_snapshots", s.id)),
      ...rows.liabilitySnapshots.map((s) => deleteRow("liability_snapshots", s.id)),
      ...rows.entries.map((e) => deleteRow("month_entries", e.id)),
    ]);
  });
});

describe("마감과 오류 처리", () => {
  it("미확인 항목이 남은 달은 마감할 수 없다", async () => {
    const data = await loadAs(owner);
    const open = workingMonth(data)!;
    const report = reportFor(data, open);
    expect(report.complete).toBe(false);
    await expect(closeMonth(open, report)).rejects.toThrow("미확인 항목이 남아");
    // 다른 달의 결과를 넘겨도 거부한다
    const other = lastClosedMonth(data)!.summary!;
    await expect(closeMonth(open, other)).rejects.toThrow("미확인 항목이 남아");
    expect(workingMonth(await loadAs(owner))!.id).toBe(open.id);
  });

  it("마감된 달의 입력을 고치려 하면 조용히 넘어가지 않고 오류로 알린다", async () => {
    setSupabaseClient(owner);
    const backup = await exportBackup();
    const closed = backup.months.find((m) => m.status === "closed")!;
    const snapshot = backup.assetSnapshots.find((s) => s.month_id === closed.id)!;
    await expect(saveAssetSnapshot(closed.id, snapshot.asset_id, snapshot, { value: 1, principal: 1 })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(deleteRow("asset_snapshots", snapshot.id)).rejects.toBeInstanceOf(ConflictError);
    // 새 자산을 마감된 달에 등록하려 하면 실패하고, 자산만 덩그러니 남지 않는다
    const before = (await loadAs(owner)).assets.length;
    await expect(
      createAssetWithSnapshot({
        asset: { name: "마감된 달에 등록", kind: "cash", liquidity: "liquid", owner_member_id: null },
        monthId: closed.id,
        value: 1,
        principal: 1,
        existedBefore: false,
      }),
    ).rejects.toThrow();
    expect((await loadAs(owner)).assets).toHaveLength(before);
    // 값은 그대로다
    const after = await exportBackup();
    expect(after.assetSnapshots.find((s) => s.id === snapshot.id)!.value).toBe(snapshot.value);
  });

  it("이자 있는 대출은 기간과 첫 납부 월 없이 등록할 수 없다", async () => {
    setSupabaseClient(owner);
    await expect(
      insertRow("liabilities", { name: "주담대", kind: "amortized", original_principal: 100_000_000, annual_rate: 4 }),
    ).rejects.toThrow("입력값이 올바르지 않습니다");
    await expect(
      insertRow("liabilities", { name: "원금 없는 지급", kind: "interest_only", original_principal: 0, monthly_payment: 100_000 }),
    ).rejects.toThrow("입력값이 올바르지 않습니다");
  });
});

describe("기존 자산을 뒤늦게 등록", () => {
  it("이번 달에 넣은 돈만 저축으로 잡히고 나머지는 기초 조정이 된다", async () => {
    let data = await loadAs(owner);
    const open = workingMonth(data)!;
    const before = reportFor(data, open);
    // 전부터 붓던 적금(월말 350만)을 이제야 등록한다. 이번 달에 50만 원을 넣었다.
    const created = await createAssetWithSnapshot({
      asset: { name: "잊고 있던 적금", kind: "savings", liquidity: "short", owner_member_id: data.members[1].id },
      monthId: open.id,
      value: 3_500_000,
      principal: 3_500_000,
      existedBefore: true,
      contributedThisMonth: 500_000,
    });
    data = await loadAs(owner);
    const after = reportFor(data, workingMonth(data)!);
    const line = after.assetLines.find((l) => l.assetId === created.id)!;
    expect(line.adjustment).toBe(3_000_000);
    expect(line.contributed).toBe(500_000);
    expect(after.adjustment - before.adjustment).toBe(3_000_000);
    expect(after.closing.assets - before.closing.assets).toBe(3_500_000);
  });
});

describe("계획 항목 삭제 제한", () => {
  it("실제 값이 연결된 계획 항목은 삭제할 수 없고, 연결이 없으면 삭제된다", async () => {
    const data = await loadAs(owner);
    const salary = data.planItems.find((p) => p.kind === "income" && p.income_type === "salary")!;
    await expect(deleteRow("plan_items", salary.id)).rejects.toThrow("보관 처리");

    const unused = await insertRow<PlanItem>("plan_items", { kind: "expense", name: "잘못 만든 항목", amount: 1, member_id: null });
    await expect(deleteRow("plan_items", unused.id)).resolves.toBeUndefined();
  });
});

describe("백업과 복원", () => {
  /** 복원 전후 비교용: 서버가 바꾸는 값(version, updated_at)을 뺀다 */
  function comparable(rows: object[]): object[] {
    return rows
      .map((row) => {
        const { version, updated_at, ...rest } = row as Record<string, unknown>;
        void version;
        void updated_at;
        return rest;
      })
      .sort((a, b) => String((a as { id: string }).id).localeCompare(String((b as { id: string }).id)));
  }

  it("백업으로 복원하면 내보낸 시점의 데이터로 정확히 돌아간다", async () => {
    setSupabaseClient(owner);
    const backup = await exportBackup();

    // 백업 이후 데이터를 망가뜨린다: 목표 삭제, 자산 이름 변경, 잔액 수정, 항목 추가
    const data = await loadAs(owner);
    await deleteRow("goals", data.goals[0].id);
    await updateRow<Asset>("assets", data.assets[0], { name: "망가진 이름" });
    const open = workingMonth(data)!;
    const existing = data.monthData[open.id].assetSnapshots.find((s) => s.asset_id === data.assets[1].id);
    await saveAssetSnapshot(open.id, data.assets[1].id, existing, { value: 1, principal: 1 });
    await insertRow<Goal>("goals", { name: "백업 뒤에 만든 목표", target_amount: 1 });

    await restoreBackup(backup);

    const restored = await exportBackup();
    for (const key of [
      "assets",
      "liabilities",
      "planItems",
      "assetSnapshots",
      "liabilitySnapshots",
      "monthEntries",
      "goals",
      "goalAllocations",
      "scenarios",
      "events",
    ] as const) {
      expect(comparable(restored[key]), key).toEqual(comparable(backup[key]));
    }
    // 마감된 달의 동결 결과도 그대로
    expect(restored.months.map((m) => [m.month, m.status, m.summary])).toEqual(
      backup.months.map((m) => [m.month, m.status, m.summary]),
    );
    // 배우자에게도 같은 데이터가 보인다
    const theirs = await loadAs(partner);
    expect(theirs.goals.map((g) => g.name).sort()).toEqual(backup.goals.map((g) => g.name).sort());
  });

  it("다른 가구의 백업을 복원해도 내 가구에만 쓰이고, 구성원은 순서대로 대응된다", async () => {
    setSupabaseClient(owner);
    const mine = await exportBackup();

    // 다른 가구(새 프로젝트로 옮긴 상황을 흉내)에서 내 백업을 복원한다.
    // 같은 DB 에 원본이 남아 있으면 행 id 가 겹치므로, 행 id 를 새로 바꾼 사본으로 시험한다.
    const other = await seedDemo({ closedMonths: 0, quiet: true });
    const otherOwner = await signIn(other.ownerEmail);
    const keep = new Set([mine.household.id, ...mine.members.map((m) => m.id)]);
    let text = JSON.stringify(mine);
    const ids = new Set(text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g));
    for (const id of ids) {
      if (!keep.has(id)) text = text.replaceAll(id, crypto.randomUUID());
    }

    setSupabaseClient(otherOwner);
    await restoreBackup(JSON.parse(text));

    const restored = await loadAs(otherOwner);
    expect(restored.household.id).toBe(other.householdId);
    expect(restored.assets.map((a) => a.name).sort()).toEqual(mine.assets.map((a) => a.name).sort());
    expect(restored.assets.every((a) => a.household_id === other.householdId)).toBe(true);
    // 첫 번째 구성원 소유 자산은 새 가구의 첫 번째 구성원 소유가 된다
    const firstOld = mine.members[0].id;
    const firstNew = restored.members[0].id;
    expect(restored.assets.filter((a) => a.owner_member_id === firstNew).map((a) => a.name).sort()).toEqual(
      mine.assets.filter((a) => a.owner_member_id === firstOld).map((a) => a.name).sort(),
    );
    // 마감 결과 속 주머니 id 도 새 구성원으로 바뀌어 있다
    const closed = restored.months.find((m) => m.status === "closed" && m.summary && !m.summary.isBaseline)!;
    expect(closed.summary!.pockets.map((p) => p.pocket)).toContain(firstNew);
    expect(JSON.stringify(closed.summary)).not.toContain(firstOld);

    // 원래 가구는 영향받지 않는다
    setSupabaseClient(owner);
    expect((await exportBackup()).assets).toHaveLength(mine.assets.length);

    // 정리
    const admin = adminClient();
    const { data: members } = await admin.from("members").select("user_id").eq("household_id", other.householdId);
    await admin.from("households").delete().eq("id", other.householdId);
    for (const member of members ?? []) {
      if (member.user_id) await admin.auth.admin.deleteUser(member.user_id);
    }
  });

  it("형식이 맞지 않는 파일은 거부하고 기존 데이터는 그대로 둔다", async () => {
    setSupabaseClient(owner);
    const before = await exportBackup();
    await expect(restoreBackup({ ...before, app: "other" } as never)).rejects.toThrow("백업 파일이 아니거나");
    // 중간에 실패하는 경우(존재하지 않는 자산을 가리키는 스냅샷): 전체가 되돌려진다
    const broken = structuredClone(before);
    broken.assetSnapshots[0].asset_id = crypto.randomUUID();
    await expect(restoreBackup(broken)).rejects.toThrow();
    expect((await exportBackup()).assets).toHaveLength(before.assets.length);
  });
});
