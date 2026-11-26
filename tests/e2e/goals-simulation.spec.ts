import { expect, test, type Page } from "@playwright/test";

import { baseScenario, currentPosition, goalsView, positionView, basisText, simulationInputFor } from "@/lib/data/derive";
import type { HouseholdData } from "@/lib/data/types";
import { resolveAssumptions, simulate } from "@/lib/finance";
import type { Assumptions, Scenario } from "@/lib/finance/types";
import { formatCompactWon, formatPercent, formatWon } from "@/lib/format";
import { addMonths, currentYm, ymParts } from "@/lib/month";
import { horizonRows } from "@/features/simulation/projection";

import type { SeedResult } from "../../scripts/seed-demo";
import { isMobile, loadHousehold, loginAs, removeHousehold, seedOwnHousehold, statValue, toast } from "./helpers";

/** 목표·이벤트·가정을 바꾸므로 이 스펙 전용 가구를 쓴다 */
let seed: SeedResult | undefined;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  seed = await seedOwnHousehold("goals", testInfo);
});

test.afterAll(async () => {
  await removeHousehold(seed);
});

const load = () => loadHousehold(seed!.ownerEmail, seed!.password);

async function openGoals(page: Page) {
  await page.goto("/goals");
  await expect(page.getByRole("heading", { level: 1, name: "목표", exact: true })).toBeVisible();
}

function goalCard(page: Page, name: string) {
  return page.locator('[data-slot="card"]').filter({ has: page.getByText(name, { exact: true }) });
}

async function deleteGoal(page: Page, name: string) {
  await page.getByRole("button", { name: `${name} 메뉴` }).click();
  await page.getByRole("menuitem", { name: "삭제" }).click();
  await page.getByRole("alertdialog", { name: `'${name}' 목표를 삭제할까요?` }).getByRole("button", { name: "삭제", exact: true }).click();
  await expect(toast(page, "목표를 삭제했습니다")).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
}

test("직접 입력 목표를 추가하면 달성률이 보인다", async ({ page }) => {
  const GOAL = { name: "E2E 가전 교체", target: 2_000_000, saved: 500_000 };
  await loginAs(page, seed!);
  await openGoals(page);

  await test.step("목표 추가 (직접 입력)", async () => {
    await page.getByRole("button", { name: "목표 추가" }).click();
    const dialog = page.getByRole("dialog", { name: "목표 추가" });
    await dialog.getByLabel("이름").fill(GOAL.name);
    await dialog.getByLabel("목표 금액").fill(String(GOAL.target));
    await dialog.getByRole("radio", { name: /^직접 입력/ }).click();
    await dialog.getByLabel("지금까지 모은 금액").fill(String(GOAL.saved));
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(toast(page, "목표를 만들었습니다")).toBeVisible();
    await expect(dialog).toBeHidden();
  });

  await test.step("달성률이 lib 계산(goalsView)과 같다", async () => {
    const data = await load();
    const goal = data.goals.find((candidate) => candidate.name === GOAL.name)!;
    const progress = goalsView(data, currentYm()).progress.find((candidate) => candidate.goalId === goal.id)!;
    expect(progress.percent).toBe(25);

    const card = goalCard(page, GOAL.name);
    await expect(card.getByRole("progressbar", { name: `${GOAL.name} 달성률` })).toHaveAttribute("aria-valuenow", String(progress.percent));
    await expect(card.getByText(formatPercent(progress.percent), { exact: true })).toBeVisible();
    await expect(card.getByText(formatWon(GOAL.saved), { exact: true })).toBeVisible();
    await expect(card).toContainText(`남은 금액 ${formatWon(GOAL.target - GOAL.saved)}`);
  });

  await deleteGoal(page, GOAL.name);
});

test("자산을 연결한 목표: 이미 다른 목표에 배정된 몫은 다시 배정하지 않는다", async ({ page }) => {
  const GOAL = { name: "E2E 이사 비용", target: 30_000_000 };
  const data = await load();
  const position = currentPosition(data);
  const joint = data.assets.find((asset) => asset.name === "공용통장")!;
  const jointValue = position.assetValues[joint.id];
  const before = goalsView(data, currentYm());
  // 시드: '입주 잔금 자기자금' 목표가 공용통장에서 300만 원을 금액 지정으로 먼저 배정받는다 (가용자산 중 목표 몫 = 300만 원)
  expect(before.allocatedLiquid).toBe(3_000_000);
  expect(jointValue).toBeGreaterThan(3_000_000);
  expect(jointValue).toBeLessThan(GOAL.target);

  await loginAs(page, seed!);
  await openGoals(page);
  await expect(statValue(page, "여유 가용자산")).toHaveText(formatWon(position.totals.liquid - 3_000_000));
  await expect(page.locator('[data-slot="stat"]').filter({ hasText: "여유 가용자산" })).toContainText(basisText(positionView(data)!.basis));

  await test.step("공용통장 평가금액 전부를 금액 지정으로 연결한 목표 추가", async () => {
    await page.getByRole("button", { name: "목표 추가" }).click();
    const dialog = page.getByRole("dialog", { name: "목표 추가" });
    await dialog.getByLabel("이름").fill(GOAL.name);
    await dialog.getByLabel("목표 금액").fill(String(GOAL.target));
    await dialog.getByRole("radio", { name: /^연결한 자산/ }).click();
    await dialog.getByRole("button", { name: "자산 연결" }).click();
    await dialog.getByRole("combobox", { name: "자산" }).selectOption({ label: joint.name });
    // 평가금액 전부를 요청한다 (이미 300만 원이 다른 목표 몫이다)
    await dialog.getByRole("radiogroup", { name: "배정 방식" }).getByRole("radio", { name: "금액 지정" }).click();
    await expect(dialog.getByRole("textbox", { name: "배정 금액" })).toHaveValue(jointValue.toLocaleString("ko-KR"));
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(toast(page, "목표를 만들었습니다")).toBeVisible();
    await expect(dialog).toBeHidden();
  });

  await test.step("남은 평가금액만 배정되고, 합계가 자산 평가금액을 넘지 않는다", async () => {
    const after = await load();
    const view = goalsView(after, currentYm());
    const goal = after.goals.find((candidate) => candidate.name === GOAL.name)!;
    const progress = view.progress.find((candidate) => candidate.goalId === goal.id)!;
    // 손으로 계산한 값: 공용통장 평가금액 − 먼저 배정된 300만 원
    const expected = jointValue - 3_000_000;
    expect(progress.current).toBe(expected);
    expect(progress.shortfall).toBe(3_000_000);
    expect(progress.allocations).toEqual([{ assetId: joint.id, requested: jointValue, allocated: expected }]);
    const jointTotal = view.progress.flatMap((p) => p.allocations).filter((a) => a.assetId === joint.id).reduce((sum, a) => sum + a.allocated, 0);
    expect(jointTotal).toBe(jointValue);
    expect(view.allocatedLiquid).toBe(jointValue);

    const card = goalCard(page, GOAL.name);
    await expect(card.getByText(formatWon(expected), { exact: true }).first()).toBeVisible();
    const linked = card.getByRole("listitem").filter({ hasText: joint.name });
    await expect(linked).toContainText(formatWon(expected));
    await expect(linked).toContainText(`요청 ${formatWon(jointValue)}`);
    await expect(card).toContainText(`다른 목표에 먼저 배정되어 ${formatWon(3_000_000)} 부족`);
    await expect(card).toContainText(`남은 금액 ${formatWon(GOAL.target - expected)}`);

    // 상단 합계: 가용자산 중 목표 몫 = 공용통장 평가금액 전체 (두 번 세지 않는다), 여유 가용자산은 그만큼 줄어든다
    const share = page.locator("dt").filter({ hasText: /^\s*가용자산 중 목표 몫\s*$/ }).locator("xpath=following-sibling::dd[1]");
    await expect(share).toHaveText(formatWon(jointValue));
    await expect(statValue(page, "여유 가용자산")).toHaveText(formatWon(position.totals.liquid - jointValue));
    // 목표는 자산이 아니다: 총자산은 그대로
    expect(currentPosition(after).totals.assets).toBe(position.totals.assets);
  });

  await deleteGoal(page, GOAL.name);
  await expect(statValue(page, "여유 가용자산")).toHaveText(formatWon(position.totals.liquid - 3_000_000));
});

test("시뮬레이션 가정을 바꾸면 요약 숫자가 바뀌고, 실제 기록은 그대로다", async ({ page }, testInfo) => {
  const data = await load();
  const assetsBefore = currentPosition(data).totals.assets;

  await loginAs(page, seed!);
  await openSimulation(page);
  await expect(tenYears(page)).toHaveText(formatCompactWon(expectedTenYears(data, {})));

  if (isMobile(testInfo)) await page.getByRole("button", { name: /^가정 펼치기/ }).click();
  const adjust = page.getByRole("textbox", { name: "월 저축 조정액" });

  await test.step("월 저축 조정액 +50만 원 → 10년 뒤 순자산이 늘어난다", async () => {
    await adjust.fill("500000");
    const expected = expectedTenYears(data, { monthlySavingsAdjust: 500_000 });
    expect(expected).toBeGreaterThan(expectedTenYears(data, {}));
    await expect(tenYears(page)).toHaveText(formatCompactWon(expected));
    await expect(page.getByText("자동 저장", { exact: true })).toBeVisible();
  });

  await test.step("실제 기록(총자산)은 바뀌지 않는다", async () => {
    await expect
      .poll(async () => resolveAssumptions(baseScenario(await load())!.assumptions).monthlySavingsAdjust)
      .toBe(500_000);
    const after = await load();
    expect(currentPosition(after).totals.assets).toBe(assetsBefore);
    await page.goto("/assets");
    await expect(statValue(page, "총자산")).toHaveText(formatWon(assetsBefore));
  });

  await test.step("정리: 가정을 되돌린다", async () => {
    await openSimulation(page);
    if (isMobile(testInfo)) await page.getByRole("button", { name: /^가정 펼치기/ }).click();
    await page.getByRole("textbox", { name: "월 저축 조정액" }).fill("0");
    await expect(tenYears(page)).toHaveText(formatCompactWon(expectedTenYears(data, {})));
    await expect(page.getByText("자동 저장", { exact: true })).toBeVisible();
    await expect.poll(async () => resolveAssumptions(baseScenario(await load())!.assumptions).monthlySavingsAdjust).toBe(0);
  });
});

test("미래 이벤트를 추가하면 예상 순자산이 바뀌고, 지우면 돌아온다", async ({ page }) => {
  const EVENT = { name: "E2E 차량 교체", amount: 20_000_000 };
  const data = await load();
  const beforeTen = expectedTenYears(data, {});
  const eventMonth = addMonths(currentYm(), 14);

  await loginAs(page, seed!);
  await openSimulation(page);
  await expect(tenYears(page)).toHaveText(formatCompactWon(beforeTen));

  const events = page.locator('[data-slot="card"]').filter({ has: page.getByText("미래 이벤트", { exact: true }) });
  await events.getByRole("button", { name: "추가" }).click();
  const dialog = page.getByRole("dialog", { name: "미래 이벤트 추가" });
  await dialog.getByLabel("종류").selectOption({ label: "일회성 지출·수입" });
  await dialog.getByLabel("이름").fill(EVENT.name);
  // 연도 선택은 올해부터 시작한다
  const year = dialog.getByRole("combobox", { name: "연도" });
  await expect(year.locator("option").first()).toHaveText(`${ymParts(currentYm()).year}년`);
  await year.selectOption(String(ymParts(eventMonth).year));
  await dialog.getByRole("combobox", { name: "월", exact: true }).selectOption(String(ymParts(eventMonth).month));
  await expect(dialog.getByRole("radio", { name: "나가는 돈" })).toBeChecked();
  await dialog.getByLabel("금액", { exact: true }).fill(String(EVENT.amount));
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(toast(page, "이벤트를 추가했습니다")).toBeVisible();
  await expect(dialog).toBeHidden();

  const after = await load();
  const saved = after.events.find((event) => event.name === EVENT.name)!;
  expect(saved).toMatchObject({ kind: "one_time", month: eventMonth, scenario_id: null });
  const afterTen = expectedTenYears(after, {});
  // 2,000만 원이 나가면 10년 뒤 순자산은 최소 그만큼 줄어든다 (그 돈의 수익도 사라진다)
  expect(afterTen).toBeLessThanOrEqual(beforeTen - EVENT.amount);
  await expect(tenYears(page)).toHaveText(formatCompactWon(afterTen));
  await expect(events.getByRole("button", { name: new RegExp(`^${EVENT.name}`) })).toBeVisible();

  await test.step("정리: 이벤트 삭제", async () => {
    await events.getByRole("button", { name: new RegExp(`^${EVENT.name}`) }).click();
    const edit = page.getByRole("dialog", { name: "이벤트 수정" });
    await edit.getByRole("button", { name: "삭제", exact: true }).click();
    await page.getByRole("alertdialog", { name: `'${EVENT.name}' 이벤트를 삭제할까요?` }).getByRole("button", { name: "삭제", exact: true }).click();
    await expect(toast(page, "이벤트를 삭제했습니다")).toBeVisible();
    await expect(tenYears(page)).toHaveText(formatCompactWon(beforeTen));
  });
});

test("시나리오를 고르면 기본 시나리오와 비교한 차이가 보인다", async ({ page }) => {
  const data = await load();
  const base = baseScenario(data)!;
  const jobChange = data.scenarios.find((scenario) => scenario.name === "하늘 이직")!;
  const [row] = compareTenYears(data, jobChange, base);
  expect(row.diff).not.toBeNull();
  expect(row.diff!).toBeGreaterThan(0);

  await loginAs(page, seed!);
  await openSimulation(page);
  await page.getByRole("combobox", { name: "시나리오" }).selectOption({ label: jobChange.name });
  await expect(page.getByText(`${base.name}과 비교`, { exact: false })).toBeVisible();
  await expect(page.getByText(`${base.name} 대비`, { exact: true })).toBeVisible();
  await expect(tenYears(page)).toHaveText(formatCompactWon(row.netWorth));
  const diff = page.locator("dt", { hasText: /^10년 뒤/ }).locator("xpath=following-sibling::dd[1]").locator('[data-slot="delta"]');
  await expect(diff).toHaveAttribute("data-direction", "up");
  await expect(diff).toContainText(formatCompactWon(Math.abs(row.diff!)));
  // 시나리오 전용 이벤트가 보인다
  await expect(page.getByText("이 시나리오만", { exact: true })).toBeVisible();
  // 비교 그래프: 두 시나리오의 선이 범례와 함께 그려진다
  const chart = page.getByRole("figure", { name: `${jobChange.name} 순자산 예상 추이` });
  await expect(chart.locator(".recharts-line")).toHaveCount(2);
  const legend = page.locator('[data-slot="chart-legend"]');
  await expect(legend.getByText(base.name, { exact: true })).toBeVisible();
  await expect(legend.getByText(jobChange.name, { exact: true })).toBeVisible();
});

async function openSimulation(page: Page) {
  await page.goto("/simulation");
  await expect(page.getByRole("heading", { level: 1, name: "미래 시뮬레이션" })).toBeVisible();
}

/** "예상 순자산" 카드의 10년 뒤 값 */
function tenYears(page: Page) {
  return page.locator("dt", { hasText: /^10년 뒤/ }).locator("xpath=following-sibling::dd[1]").locator('[data-slot="money"]');
}

/** 기본 시나리오에 가정을 덧씌워 앱과 같은 방식으로 10년 뒤 순자산을 구한다 */
function expectedTenYears(data: HouseholdData, patch: Partial<Assumptions>): number {
  const base = baseScenario(data)!;
  const assumptions = { ...resolveAssumptions(base.assumptions), ...patch };
  const result = simulate(simulationInputFor(data, base, { assumptions }));
  return horizonRows(result.points, null, [10])[0].netWorth;
}

/** 고른 시나리오의 10년 뒤 순자산과 기본 시나리오 대비 차이 (화면과 같은 horizonRows) */
function compareTenYears(data: HouseholdData, scenario: Scenario, base: Scenario) {
  const selected = simulate(simulationInputFor(data, scenario, { assumptions: resolveAssumptions(scenario.assumptions) }));
  const baseline = simulate(simulationInputFor(data, base));
  return horizonRows(selected.points, baseline.points, [10]);
}
