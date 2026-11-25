import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, cleanup, createHousehold, createUser, one, type TestUser } from "./helpers";

const TABLES = [
  "households",
  "members",
  "assets",
  "liabilities",
  "plan_items",
  "months",
  "asset_snapshots",
  "liability_snapshots",
  "month_entries",
  "goals",
  "goal_allocations",
  "scenarios",
  "future_events",
];

let owner: TestUser; // 가구 A 를 만든 사람
let partner: TestUser; // 가구 A 에 초대된 배우자
let outsider: TestUser; // 가구 B
let stranger: TestUser; // 가구가 없는 로그인 사용자
let householdA: string;
let householdB: string;
let assetA: { id: string; version: number };
let monthA: { id: string; version: number };

beforeAll(async () => {
  [owner, partner, outsider, stranger] = await Promise.all([
    createUser("owner"),
    createUser("partner"),
    createUser("outsider"),
    createUser("stranger"),
  ]);
  householdA = await createHousehold(owner, partner.email);
  householdB = await createHousehold(outsider, null);

  const asset = await owner.client
    .from("assets")
    .insert({ name: "A 가구 통장", kind: "cash", liquidity: "liquid" })
    .select()
    .single();
  expect(asset.error).toBeNull();
  assetA = asset.data;

  const month = await owner.client.from("months").select("*").single();
  expect(month.error).toBeNull();
  monthA = month.data;
});

afterAll(cleanup);

describe("인증되지 않은 접근", () => {
  it("어떤 테이블도 읽을 수 없다", async () => {
    const anon = anonClient();
    for (const table of TABLES) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      // 권한 자체가 없어 오류가 나거나, 최소한 빈 결과여야 한다
      expect(error !== null || (data ?? []).length === 0, `${table} 이 anon 에게 노출됨`).toBe(true);
    }
  });

  it("쓸 수도 없다", async () => {
    const anon = anonClient();
    const insert = await anon.from("assets").insert({ household_id: householdA, name: "x", kind: "cash", liquidity: "liquid" });
    expect(insert.error).not.toBeNull();
    const update = await anon.from("assets").update({ name: "hacked" }).eq("id", assetA.id).select();
    expect(update.error !== null || (update.data ?? []).length === 0).toBe(true);
    expect((await one<{ name: string }>(owner.client, "assets", assetA.id)).name).toBe("A 가구 통장");
  });

  it("RPC 를 호출할 수 없다 (ping 제외)", async () => {
    const anon = anonClient();
    expect((await anon.rpc("claim_membership")).error).not.toBeNull();
    expect(
      (
        await anon.rpc("create_household", {
          p_household_name: "x",
          p_my_name: "x",
          p_partner_name: "x",
          p_partner_email: null,
          p_start_month: "2026-01",
        })
      ).error,
    ).not.toBeNull();
    expect((await anon.rpc("close_month", { p_month_id: monthA.id, p_summary: {}, p_version: 1 })).error).not.toBeNull();
    const ping = await anon.rpc("ping");
    expect(ping.error).toBeNull();
    expect(ping.data).toBe("ok");
  });

  it("공개 회원가입이 꺼져 있다", async () => {
    const { data, error } = await anonClient().auth.signUp({ email: "new-user@example.com", password: "password-1234" });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });
});

describe("가구 간 격리", () => {
  it("다른 가구의 데이터는 보이지 않는다", async () => {
    for (const table of TABLES) {
      const { data, error } = await outsider.client.from(table).select("*");
      expect(error).toBeNull();
      for (const row of data ?? []) {
        const householdId = table === "households" ? row.id : row.household_id;
        expect(householdId, `${table} 에서 다른 가구 행이 보임`).toBe(householdB);
      }
    }
    const direct = await outsider.client.from("assets").select("*").eq("id", assetA.id);
    expect(direct.data).toEqual([]);
  });

  it("가구가 없는 로그인 사용자에게는 아무것도 보이지 않는다", async () => {
    for (const table of TABLES) {
      const { data, error } = await stranger.client.from(table).select("*");
      expect(error).toBeNull();
      expect(data, `${table} 이 가구 없는 사용자에게 보임`).toEqual([]);
    }
  });

  it("다른 가구에 행을 넣을 수 없다", async () => {
    const forged = await outsider.client
      .from("assets")
      .insert({ household_id: householdA, name: "침입", kind: "cash", liquidity: "liquid" });
    expect(forged.error).not.toBeNull();

    // 자기 가구 행이지만 다른 가구의 월을 가리키는 스냅샷도 막힌다
    const ownAsset = await outsider.client
      .from("assets")
      .insert({ name: "B 통장", kind: "cash", liquidity: "liquid" })
      .select()
      .single();
    expect(ownAsset.error).toBeNull();
    const crossMonth = await outsider.client
      .from("asset_snapshots")
      .insert({ month_id: monthA.id, asset_id: ownAsset.data.id, value: 1, principal: 1 });
    expect(crossMonth.error).not.toBeNull();
    const crossAsset = await outsider.client.from("goal_allocations").insert({
      goal_id: (await outsider.client.from("goals").insert({ name: "g", target_amount: 1 }).select().single()).data.id,
      asset_id: assetA.id,
    });
    expect(crossAsset.error).not.toBeNull();
  });

  it("다른 가구의 행을 수정·삭제할 수 없다", async () => {
    const update = await outsider.client.from("assets").update({ name: "hacked" }).eq("id", assetA.id).select();
    expect(update.data ?? []).toEqual([]);
    const remove = await outsider.client.from("assets").delete().eq("id", assetA.id).select();
    expect(remove.data ?? []).toEqual([]);
    expect((await one<{ name: string }>(owner.client, "assets", assetA.id)).name).toBe("A 가구 통장");
  });

  it("다른 가구의 월을 마감하거나 다시 열 수 없다", async () => {
    const close = await outsider.client.rpc("close_month", { p_month_id: monthA.id, p_summary: {}, p_version: monthA.version });
    expect(close.error?.message).toContain("month_not_found");
    const reopen = await outsider.client.rpc("reopen_month", { p_month_id: monthA.id });
    expect(reopen.error?.message).toContain("month_not_found");
  });

  it("household_id 를 바꿔 행을 다른 가구로 옮길 수 없다", async () => {
    const move = await owner.client.from("assets").update({ household_id: householdB }).eq("id", assetA.id).select();
    expect(move.error).not.toBeNull();
    expect((await one<{ household_id: string }>(owner.client, "assets", assetA.id)).household_id).toBe(householdA);
  });
});

describe("가구 구성과 초대", () => {
  it("초대받지 않은 사용자는 가구에 들어갈 수 없다", async () => {
    const claim = await stranger.client.rpc("claim_membership");
    expect(claim.error).toBeNull();
    expect(claim.data).toBeNull();
  });

  it("초대된 이메일로 로그인한 배우자만 연결된다", async () => {
    // 연결 전에는 A 가구가 보이지 않는다
    expect((await partner.client.from("assets").select("*")).data).toEqual([]);
    const claim = await partner.client.rpc("claim_membership");
    expect(claim.error).toBeNull();
    expect(claim.data).toBe(householdA);
    // 다시 호출해도 같은 결과
    expect((await partner.client.rpc("claim_membership")).data).toBe(householdA);
  });

  it("부부는 같은 데이터를 본다", async () => {
    const seen = await partner.client.from("assets").select("*").eq("id", assetA.id).single();
    expect(seen.data.name).toBe("A 가구 통장");
    const members = await partner.client.from("members").select("*");
    expect(members.data).toHaveLength(2);
  });

  it("구성원의 계정 연결(user_id)이나 소속 가구를 직접 바꿀 수 없다", async () => {
    const members = (await owner.client.from("members").select("*")).data!;
    const partnerRow = members.find((m) => m.user_id === partner.id)!;
    const hijack = await owner.client.from("members").update({ user_id: stranger.id }).eq("id", partnerRow.id).select();
    expect(hijack.error).not.toBeNull();
    const move = await owner.client.from("members").update({ household_id: householdB }).eq("id", partnerRow.id).select();
    expect(move.error).not.toBeNull();
    const insert = await owner.client.from("members").insert({ household_id: householdA, name: "세 번째", user_id: stranger.id });
    expect(insert.error).not.toBeNull();
    const remove = await owner.client.from("members").delete().eq("id", partnerRow.id).select();
    expect(remove.error !== null || (remove.data ?? []).length === 0).toBe(true);
  });

  it("이미 가구가 있으면 새 가구를 만들 수 없다", async () => {
    const again = await owner.client.rpc("create_household", {
      p_household_name: "둘째 가구",
      p_my_name: "본인",
      p_partner_name: "배우자",
      p_partner_email: null,
      p_start_month: "2026-01",
    });
    expect(again.error?.message).toContain("already_member");
  });

  it("이메일 인증이 안 된 계정은 초대를 수락할 수 없다", async () => {
    const unconfirmed = await createUser("unconfirmed", { confirmed: false });
    const inviter = await createUser("inviter");
    await createHousehold(inviter, unconfirmed.email);

    // 로컬 설정에서는 미인증 계정도 로그인은 될 수 있다. 로그인이 되더라도 연결되면 안 된다.
    const signIn = await unconfirmed.client.auth.signInWithPassword({ email: unconfirmed.email, password: "test-password-1234" });
    if (!signIn.error) {
      const claim = await unconfirmed.client.rpc("claim_membership");
      expect(claim.data).toBeNull();
      expect((await unconfirmed.client.from("assets").select("*")).data).toEqual([]);
    }
    const { data } = await adminClient().from("members").select("user_id").eq("email", unconfirmed.email).single();
    expect(data!.user_id).toBeNull();
  });
});

describe("동시 수정 (낙관적 잠금)", () => {
  it("같은 버전을 보고 수정하면 나중 쪽이 거부된다", async () => {
    const before = await one<{ id: string; version: number }>(owner.client, "assets", assetA.id);

    const first = await owner.client
      .from("assets")
      .update({ memo: "본인이 수정", version: before.version })
      .eq("id", assetA.id)
      .select()
      .single();
    expect(first.error).toBeNull();
    expect(first.data.version).toBe(before.version + 1);

    const second = await partner.client
      .from("assets")
      .update({ memo: "배우자가 수정", version: before.version })
      .eq("id", assetA.id)
      .select();
    expect(second.error?.code).toBe("40001");
    expect(second.error?.message).toContain("version_conflict");

    const after = await one<{ memo: string; version: number }>(owner.client, "assets", assetA.id);
    expect(after.memo).toBe("본인이 수정");

    // 최신 버전을 다시 읽으면 수정할 수 있다
    const retry = await partner.client
      .from("assets")
      .update({ memo: "배우자가 다시 수정", version: after.version })
      .eq("id", assetA.id)
      .select()
      .single();
    expect(retry.error).toBeNull();
    assetA = retry.data;
  });

  it("같은 자산의 같은 달 스냅샷은 하나만 만들 수 있다", async () => {
    const values = { month_id: monthA.id, asset_id: assetA.id, value: 1_000_000, principal: 1_000_000 };
    const first = await owner.client.from("asset_snapshots").insert(values).select().single();
    expect(first.error).toBeNull();
    const duplicate = await partner.client.from("asset_snapshots").insert(values).select();
    expect(duplicate.error?.code).toBe("23505");
  });

  it("서로 다른 행을 동시에 고치는 것은 충돌이 아니다", async () => {
    const other = await partner.client
      .from("assets")
      .insert({ name: "배우자 통장", kind: "cash", liquidity: "liquid" })
      .select()
      .single();
    const [a, b] = await Promise.all([
      owner.client.from("assets").update({ memo: "a", version: assetA.version }).eq("id", assetA.id).select().single(),
      partner.client.from("assets").update({ memo: "b", version: other.data.version }).eq("id", other.data.id).select().single(),
    ]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    assetA = a.data;
  });
});

describe("월 마감과 과거 데이터 보존", () => {
  const summary = { version: 1, month: "2026-01", marker: "frozen" };

  it("월을 직접 만들거나 상태·결과를 직접 바꿀 수 없다", async () => {
    const insert = await owner.client.from("months").insert({ month: "2030-01" });
    expect(insert.error).not.toBeNull();
    const status = await owner.client.from("months").update({ status: "closed" }).eq("id", monthA.id).select();
    expect(status.error).not.toBeNull();
    const forged = await owner.client.from("months").update({ summary: { forged: true } }).eq("id", monthA.id).select();
    expect(forged.error).not.toBeNull();
    const remove = await owner.client.from("months").delete().eq("id", monthA.id).select();
    expect(remove.error !== null || (remove.data ?? []).length === 0).toBe(true);
  });

  it("입력이 바뀌면 월의 version 이 올라가 오래된 화면으로는 마감할 수 없다", async () => {
    const before = await one<{ version: number }>(owner.client, "months", monthA.id);
    // 배우자가 그 사이 잔액을 고쳤다
    const snapshot = await partner.client.from("asset_snapshots").select("*").eq("month_id", monthA.id).single();
    const edit = await partner.client
      .from("asset_snapshots")
      .update({ value: 1_200_000, principal: 1_200_000, version: snapshot.data.version })
      .eq("id", snapshot.data.id)
      .select()
      .single();
    expect(edit.error).toBeNull();

    const stale = await owner.client.rpc("close_month", { p_month_id: monthA.id, p_summary: summary, p_version: before.version });
    expect(stale.error?.message).toContain("version_conflict");
    monthA = await one(owner.client, "months", monthA.id);
    expect(monthA.version).toBeGreaterThan(before.version);
  });

  it("마감하면 결과가 저장되고 다음 달이 열린다", async () => {
    const closed = await owner.client.rpc("close_month", { p_month_id: monthA.id, p_summary: summary, p_version: monthA.version });
    expect(closed.error).toBeNull();
    expect(closed.data.status).toBe("closed");
    expect(closed.data.summary).toEqual(summary);
    expect(closed.data.closed_at).not.toBeNull();

    const months = (await partner.client.from("months").select("*").order("month")).data!;
    expect(months.map((m) => [m.month, m.status])).toEqual([
      ["2026-01", "closed"],
      ["2026-02", "open"],
    ]);
  });

  it("마감된 달의 입력은 수정·추가·삭제할 수 없다", async () => {
    const snapshot = (await owner.client.from("asset_snapshots").select("*").eq("month_id", monthA.id).single()).data;

    const update = await owner.client
      .from("asset_snapshots")
      .update({ value: 9, principal: 9, version: snapshot.version })
      .eq("id", snapshot.id)
      .select();
    expect(update.data ?? []).toEqual([]);

    const remove = await owner.client.from("asset_snapshots").delete().eq("id", snapshot.id).select();
    expect(remove.data ?? []).toEqual([]);

    const insertEntry = await owner.client
      .from("month_entries")
      .insert({ month_id: monthA.id, kind: "income", name: "뒤늦은 수입", amount: 1 });
    expect(insertEntry.error).not.toBeNull();

    const liability = await owner.client
      .from("liabilities")
      .insert({ name: "대출", kind: "bullet", original_principal: 1_000_000 })
      .select()
      .single();
    const insertLiabilitySnapshot = await owner.client
      .from("liability_snapshots")
      .insert({ month_id: monthA.id, liability_id: liability.data.id, balance: 1_000_000 });
    expect(insertLiabilitySnapshot.error).not.toBeNull();

    const after = await one<{ value: number }>(owner.client, "asset_snapshots", snapshot.id);
    expect(after.value).toBe(1_200_000);
  });

  it("설정을 바꿔도 마감된 달의 결과는 그대로다", async () => {
    await owner.client.from("assets").update({ name: "이름 변경", kind: "deposit", version: assetA.version }).eq("id", assetA.id);
    await owner.client.from("plan_items").insert({ kind: "income", income_type: "salary", name: "급여", amount: 5_000_000, member_id: null });
    const month = await one<{ summary: unknown; status: string }>(owner.client, "months", monthA.id);
    expect(month.status).toBe("closed");
    expect(month.summary).toEqual(summary);
  });

  it("과거 기록이 있는 자산은 삭제할 수 없다 (보관만 가능)", async () => {
    const remove = await owner.client.from("assets").delete().eq("id", assetA.id).select();
    expect(remove.error?.code).toBe("23503");
  });

  it("이미 마감된 달은 다시 마감할 수 없고, 가장 최근 마감만 다시 열 수 있다", async () => {
    const months = (await owner.client.from("months").select("*").order("month")).data!;
    const [january, february] = months;

    const again = await owner.client.rpc("close_month", { p_month_id: january.id, p_summary: summary, p_version: january.version });
    expect(again.error?.message).toContain("month_not_open");

    // 2월도 마감 → 1월은 더 이상 다시 열 수 없다
    const closeFebruary = await owner.client.rpc("close_month", {
      p_month_id: february.id,
      p_summary: { version: 1, month: "2026-02" },
      p_version: february.version,
    });
    expect(closeFebruary.error).toBeNull();
    const reopenJanuary = await owner.client.rpc("reopen_month", { p_month_id: january.id });
    expect(reopenJanuary.error?.message).toContain("later_month_closed");

    // 2월은 다시 열 수 있고, 마감 당시 결과(계획 동결용)는 남아 있다
    const reopenFebruary = await partner.client.rpc("reopen_month", { p_month_id: february.id });
    expect(reopenFebruary.error).toBeNull();
    expect(reopenFebruary.data.status).toBe("open");
    expect(reopenFebruary.data.summary).toEqual({ version: 1, month: "2026-02" });

    // 열린 달이 2월·3월 둘인 상태에서 3월을 먼저 마감할 수 없다
    const march = (await owner.client.from("months").select("*").eq("month", "2026-03").single()).data;
    const skip = await owner.client.rpc("close_month", { p_month_id: march.id, p_summary: summary, p_version: march.version });
    expect(skip.error?.message).toContain("earlier_month_open");

    // 다시 연 2월의 입력은 다시 고칠 수 있다
    const entry = await owner.client
      .from("month_entries")
      .insert({ month_id: february.id, kind: "income", name: "수입", amount: 100 })
      .select()
      .single();
    expect(entry.error).toBeNull();
  });
});
