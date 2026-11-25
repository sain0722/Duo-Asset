/**
 * 로컬 Supabase 에 가상의 부부 데이터를 넣는다 (개발·E2E 테스트용).
 *
 *   npx supabase start
 *   npm run seed            # 계정 2개 + 6개월치 기록 생성, 로그인 정보 출력
 *
 * - 모든 이름과 금액은 가상의 값이다. 실제 데이터를 여기에 적지 않는다.
 * - 앱과 같은 데이터 계층(lib/data)과 계산 코드(lib/finance)를 써서 월을 마감하므로,
 *   이 스크립트가 끝까지 돌면 "입력 → 정산 → 마감" 전체 경로가 실제 DB 에서 동작한다는 뜻이다.
 * - 키는 `supabase status` 에서 읽는다. 로컬 스택 전용이다.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { reportFor, workingMonth } from "@/lib/data/derive";
import {
  claimMembership,
  closeMonth,
  createAssetWithSnapshot,
  createHousehold,
  insertRow,
  saveAssetSnapshot,
  saveEntry,
  saveLiabilitySnapshot,
} from "@/lib/data/mutations";
import { fetchHousehold } from "@/lib/data/queries";
import { setSupabaseClient } from "@/lib/data/supabase";
import type { HouseholdData } from "@/lib/data/types";
import type {
  Asset,
  AssetKind,
  FutureEvent,
  Goal,
  GoalAllocation,
  Liability,
  PlanItem,
  Scenario,
  Won,
} from "@/lib/finance/types";
import { addMonths, currentYm, ymParts } from "@/lib/month";

export const DEMO_PASSWORD = "duoasset-demo-1234";

export interface SeedResult {
  householdId: string;
  ownerEmail: string;
  partnerEmail: string;
  password: string;
}

interface LocalStack {
  url: string;
  publishableKey: string;
  serviceKey: string;
}

function localStack(): LocalStack {
  const output = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const env: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (match) env[match[1]] = match[2];
  }
  const url = env.API_URL;
  if (!url || !/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
    throw new Error("로컬 Supabase 에서만 실행할 수 있습니다. `npx supabase start` 를 먼저 실행하세요.");
  }
  return { url, publishableKey: env.PUBLISHABLE_KEY || env.ANON_KEY, serviceKey: env.SERVICE_ROLE_KEY || env.SECRET_KEY };
}

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };

async function signedInClient(stack: LocalStack, email: string): Promise<SupabaseClient> {
  const client = createClient(stack.url, stack.publishableKey, NO_SESSION);
  const { error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error) throw new Error(`로그인 실패 (${email}): ${error.message}`);
  return client;
}

/** 시드 고정 난수: 같은 suffix 면 항상 같은 데이터 */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function load(): Promise<HouseholdData> {
  const data = await fetchHousehold();
  if (!data) throw new Error("가구 데이터를 읽지 못했습니다.");
  return data;
}

export async function seedDemo(options: { suffix?: string; closedMonths?: number; quiet?: boolean } = {}): Promise<SeedResult> {
  const stack = localStack();
  const suffix = options.suffix ?? randomUUID().slice(0, 6);
  const closedMonths = options.closedMonths ?? 5;
  const log = (message: string) => {
    if (!options.quiet) console.log(message);
  };
  const random = rng([...suffix].reduce((total, ch) => total + ch.charCodeAt(0), 7));
  /** min 이상 max 이하, 1만 원 단위 */
  const between = (min: Won, max: Won) => Math.round((min + random() * (max - min)) / 10_000) * 10_000;

  // 1. 계정 (공개 회원가입이 꺼져 있으므로 관리자 API 로 만든다)
  const admin = createClient(stack.url, stack.serviceKey, NO_SESSION);
  const ownerEmail = `haneul-${suffix}@example.com`;
  const partnerEmail = `bada-${suffix}@example.com`;
  for (const email of [ownerEmail, partnerEmail]) {
    const { error } = await admin.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true });
    if (error) throw new Error(`계정 생성 실패 (${email}): ${error.message}`);
  }

  // 2. 가구: 기준 월은 (마감할 달 수 + 1)개월 전
  const thisMonth = currentYm();
  const baselineMonth = addMonths(thisMonth, -(closedMonths + 1));
  setSupabaseClient(await signedInClient(stack, partnerEmail));
  if ((await claimMembership()) !== null) throw new Error("초대 전인데 가구에 연결됐습니다.");

  setSupabaseClient(await signedInClient(stack, ownerEmail));
  const householdId = await createHousehold({
    householdName: "하늘·바다네",
    myName: "하늘",
    partnerName: "바다",
    partnerEmail,
    startMonth: baselineMonth,
  });

  // 배우자가 초대를 수락
  const ownerClient = await signedInClient(stack, ownerEmail);
  setSupabaseClient(await signedInClient(stack, partnerEmail));
  if ((await claimMembership()) !== householdId) throw new Error("배우자 연결에 실패했습니다.");
  setSupabaseClient(ownerClient);

  let data = await load();
  const [haneul, bada] = data.members;
  const baseline = workingMonth(data)!;

  // 3. 자산 (기준 월의 잔액)
  const assetSpecs: { key: string; name: string; kind: AssetKind; owner: string | null; value: Won; principal?: Won; liquidity: Asset["liquidity"]; maturity?: string }[] = [
    { key: "hAccount", name: "하늘 급여통장", kind: "cash", owner: haneul.id, value: 2_400_000, liquidity: "liquid" },
    { key: "bAccount", name: "바다 급여통장", kind: "cash", owner: bada.id, value: 1_800_000, liquidity: "liquid" },
    { key: "joint", name: "공용통장", kind: "cash", owner: null, value: 5_200_000, liquidity: "liquid" },
    { key: "emergency", name: "비상금 예금", kind: "deposit", owner: null, value: 10_000_000, liquidity: "short" },
    { key: "bSavings", name: "바다 정기적금", kind: "savings", owner: bada.id, value: 6_000_000, liquidity: "short", maturity: `${ymParts(thisMonth).year + 1}-06-30` },
    { key: "gye", name: "계 모임", kind: "savings", owner: bada.id, value: 3_000_000, liquidity: "locked" },
    { key: "stock", name: "하늘 증권계좌", kind: "investment", owner: haneul.id, value: 18_500_000, principal: 16_000_000, liquidity: "short" },
    { key: "pension", name: "하늘 퇴직연금", kind: "pension", owner: haneul.id, value: 22_000_000, principal: 20_000_000, liquidity: "locked" },
    { key: "lease", name: "전세보증금", kind: "lease_deposit", owner: null, value: 50_000_000, liquidity: "locked" },
    { key: "presale", name: "새 아파트 분양 납부금", kind: "presale", owner: null, value: 60_000_000, liquidity: "locked" },
    { key: "car", name: "자동차", kind: "vehicle", owner: haneul.id, value: 24_000_000, principal: 32_000_000, liquidity: "locked" },
  ];
  const assets: Record<string, Asset> = {};
  for (const [index, spec] of assetSpecs.entries()) {
    assets[spec.key] = await createAssetWithSnapshot({
      asset: {
        name: spec.name,
        kind: spec.kind,
        owner_member_id: spec.owner,
        liquidity: spec.liquidity,
        maturity_date: spec.maturity ?? null,
        sort_order: index,
      },
      monthId: baseline.id,
      value: spec.value,
      principal: spec.principal ?? spec.value,
      existedBefore: false,
    });
  }

  // 4. 부채
  const carLoan = await insertRow<Liability>("liabilities", {
    name: "자동차 할부",
    kind: "installment",
    payer_member_id: haneul.id,
    original_principal: 30_000_000,
    monthly_payment: 500_000,
    term_months: 60,
    start_month: addMonths(baselineMonth, -19),
    payment_day: 10,
    withdraw_asset_id: assets.hAccount.id,
    sort_order: 0,
  });
  const parentsLoan = await insertRow<Liability>("liabilities", {
    name: "부모님 차용금",
    kind: "interest_only",
    payer_member_id: haneul.id,
    original_principal: 40_000_000,
    monthly_payment: 300_000,
    payment_day: 5,
    withdraw_asset_id: assets.hAccount.id,
    memo: "원금 상환 계획 없이 매월 용돈 겸 이자를 드린다",
    sort_order: 1,
  });
  await saveLiabilitySnapshot(baseline.id, carLoan.id, undefined, { balance: 20_000_000 });
  await saveLiabilitySnapshot(baseline.id, parentsLoan.id, undefined, { balance: 40_000_000 });

  // 5. 계획 항목
  const item = (values: Partial<PlanItem>) => insertRow<PlanItem>("plan_items", values);
  const hSalary = await item({ kind: "income", income_type: "salary", member_id: haneul.id, name: "하늘 급여", amount: 4_300_000, pay_day: 25, sort_order: 0 });
  await item({ kind: "benefit", member_id: haneul.id, name: "회사 식비 카드", amount: 300_000, sort_order: 1 });
  await item({ kind: "expense", member_id: haneul.id, name: "통신·보험", amount: 180_000, pay_day: 15, sort_order: 2 });
  const hContribution = await item({ kind: "contribution", member_id: haneul.id, name: "공용통장 입금", amount: 2_200_000, pay_day: 26, sort_order: 3 });
  await item({ kind: "saving", member_id: haneul.id, name: "주식 적립", amount: 300_000, asset_id: assets.stock.id, sort_order: 4 });
  const bSalary = await item({ kind: "income", income_type: "salary", member_id: bada.id, name: "바다 급여", amount: 3_100_000, pay_day: 21, sort_order: 5 });
  const bBonus = await item({ kind: "income", income_type: "bonus", member_id: bada.id, name: "바다 상여금", amount: 2_000_000, months_of_year: [1, 7], sort_order: 6 });
  const bContribution = await item({ kind: "contribution", member_id: bada.id, name: "공용통장 입금", amount: 1_600_000, pay_day: 22, sort_order: 7 });
  await item({ kind: "saving", member_id: bada.id, name: "정기적금", amount: 500_000, asset_id: assets.bSavings.id, sort_order: 8 });
  await item({ kind: "saving", member_id: bada.id, name: "계 모임", amount: 200_000, asset_id: assets.gye.id, sort_order: 9 });
  const housing = await item({ kind: "expense", member_id: null, name: "주거비·관리비", amount: 650_000, pay_day: 28, sort_order: 10 });
  await item({ kind: "expense", member_id: null, name: "공동생활비", amount: 1_400_000, sort_order: 11 });
  await item({ kind: "saving", member_id: null, name: "비상금 예금 이체", amount: 500_000, asset_id: assets.emergency.id, sort_order: 12 });

  // 6. 기준 월 마감 → 이후 달을 한 달씩 정산
  data = await load();
  await closeMonth(workingMonth(data)!, reportFor(data, workingMonth(data)!));

  const balance: Record<string, { value: Won; principal: Won }> = Object.fromEntries(
    assetSpecs.map((spec) => [spec.key, { value: spec.value, principal: spec.principal ?? spec.value }]),
  );
  const move = (key: string, delta: Won) => {
    balance[key].value += delta;
    balance[key].principal += delta;
  };
  let carBalance = 20_000_000;

  for (let i = 0; i <= closedMonths; i++) {
    data = await load();
    const month = workingMonth(data)!;
    const isCurrent = month.month === thisMonth;
    const hasBonus = [1, 7].includes(ymParts(month.month).month);

    // 하늘: 급여 − 공용 − 할부 − 부모님 − 주식 − 통신·보험 − 개인 지출
    const hSpend = between(600_000, 800_000);
    move("hAccount", 4_300_000 - 2_200_000 - 500_000 - 300_000 - 300_000 - 180_000 - hSpend);
    // 바다: 급여(+상여) − 공용 − 적금 − 계 − 개인 지출
    const bIncome = 3_100_000 + (hasBonus ? 2_000_000 : 0);
    const bSpend = between(600_000, 780_000) + (hasBonus ? 500_000 : 0);
    move("bAccount", bIncome - 1_600_000 - 500_000 - 200_000 - bSpend);
    move("bSavings", 500_000);
    move("gye", 200_000);
    // 공용: 입금 380 − 주거비 − 생활비 − 예금 이체
    const housingPaid = between(640_000, 680_000);
    move("joint", 3_800_000 - housingPaid - between(1_300_000, 1_560_000) - 500_000);
    move("emergency", 500_000);
    // 투자: 30만 원 적립 + 평가 변동
    balance.stock.principal += 300_000;
    balance.stock.value = Math.round((balance.stock.value * (0.97 + random() * 0.07)) / 1000) * 1000 + 300_000;
    balance.pension.value += between(120_000, 260_000);
    balance.car.value -= 250_000;
    carBalance -= 500_000;

    // 이번 달(진행 중)은 일부만 입력해 "정산 대기" 상태를 보여 준다
    const confirmedKeys = isCurrent ? ["hAccount", "joint"] : Object.keys(balance);
    for (const key of confirmedKeys) {
      await saveAssetSnapshot(month.id, assets[key].id, undefined, balance[key]);
    }
    if (!isCurrent) {
      await saveLiabilitySnapshot(month.id, carLoan.id, undefined, { balance: carBalance });
      await saveLiabilitySnapshot(month.id, parentsLoan.id, undefined, { balance: 40_000_000, interest_paid: 300_000 });
      const actual = (source: PlanItem, amount: Won) =>
        saveEntry(month.id, undefined, {
          kind: source.kind as "income" | "contribution" | "expense",
          member_id: source.member_id,
          plan_item_id: source.id,
          name: source.name,
          amount,
        });
      await actual(hSalary, 4_300_000);
      await actual(bSalary, 3_100_000);
      if (hasBonus) await actual(bBonus, 2_000_000);
      await actual(hContribution, 2_200_000);
      await actual(bContribution, 1_600_000);
      await actual(housing, housingPaid);

      data = await load();
      const open = workingMonth(data)!;
      const report = reportFor(data, open);
      if (!report.complete) {
        throw new Error(`${open.month} 정산이 완료되지 않았습니다: ${report.warnings.map((w) => w.message).join(", ")}`);
      }
      await closeMonth(open, report);
      log(`  ${open.month} 마감 — 수입 ${report.income.toLocaleString()} / 소비 ${report.consumption.toLocaleString()} / 저축 ${report.savings.toLocaleString()}`);
    }
  }

  // 7. 목표
  const goal = (values: Partial<Goal>) => insertRow<Goal>("goals", values);
  const emergencyGoal = await goal({ name: "비상금 1,500만 원", target_amount: 15_000_000, basis: "linked", monthly_contribution: 500_000, sort_order: 0 });
  await insertRow<GoalAllocation>("goal_allocations", { goal_id: emergencyGoal.id, asset_id: assets.emergency.id, amount: null });
  const moveInGoal = await goal({
    name: "입주 잔금 자기자금",
    target_amount: 30_000_000,
    target_date: `${ymParts(thisMonth).year + 2}-05-31`,
    basis: "linked",
    monthly_contribution: 700_000,
    sort_order: 1,
  });
  await insertRow<GoalAllocation>("goal_allocations", { goal_id: moveInGoal.id, asset_id: assets.bSavings.id, amount: null });
  await insertRow<GoalAllocation>("goal_allocations", { goal_id: moveInGoal.id, asset_id: assets.joint.id, amount: 3_000_000 });
  await goal({ name: "순자산 3억 원", target_amount: 300_000_000, target_date: `${ymParts(thisMonth).year + 5}-12-31`, basis: "net_worth", sort_order: 2 });
  await goal({ name: "가족 여행", target_amount: 5_000_000, basis: "manual", manual_amount: 1_200_000, monthly_contribution: 200_000, sort_order: 3 });

  // 8. 미래 이벤트와 시나리오
  const event = (values: Partial<FutureEvent>) => insertRow<FutureEvent>("future_events", values);
  await event({
    name: "새 아파트 입주",
    kind: "home_move_in",
    month: addMonths(thisMonth, 18),
    params: {
      balanceDue: 280_000_000,
      loanAmount: 200_000_000,
      loanRate: 3.9,
      loanTermMonths: 360,
      loanMethod: "amortized",
      depositReturn: 50_000_000,
      monthlyExpenseDelta: -250_000,
    },
  });
  await event({
    name: "출산·육아휴직",
    kind: "parental_leave",
    month: addMonths(thisMonth, 30),
    params: { memberId: bada.id, leaveMonths: 12, monthlyIncomeDuringLeave: 1_500_000, monthlyChildCost: 600_000, oneTimeCost: 3_000_000 },
  });
  const jobChange = await insertRow<Scenario>("scenarios", {
    name: "하늘 이직",
    is_base: false,
    assumptions: { salaryGrowthPct: 4 },
    sort_order: 1,
  });
  await event({
    name: "이직 (월 +70만 원)",
    kind: "income_change",
    scenario_id: jobChange.id,
    month: addMonths(thisMonth, 6),
    params: { memberId: haneul.id, monthlyDelta: 700_000, endMonth: null },
  });

  setSupabaseClient(undefined);
  log(`\n가상 데이터 생성 완료 (${baselineMonth} ~ ${thisMonth})`);
  log(`  본인   ${ownerEmail}`);
  log(`  배우자 ${partnerEmail}`);
  log(`  비밀번호 ${DEMO_PASSWORD}`);
  return { householdId, ownerEmail, partnerEmail, password: DEMO_PASSWORD };
}

// `npx tsx scripts/seed-demo.ts [suffix]` 로 직접 실행한 경우
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDemo({ suffix: process.argv[2] }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
