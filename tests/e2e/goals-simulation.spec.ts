import { expect, test, type Page } from "@playwright/test";

import { baseScenario, currentPosition, goalsView, simulationInputFor } from "@/lib/data/derive";
import type { HouseholdData } from "@/lib/data/types";
import { resolveAssumptions, simulate } from "@/lib/finance";
import type { Assumptions } from "@/lib/finance/types";
import { formatCompactWon, formatPercent, formatWon } from "@/lib/format";
import { currentYm } from "@/lib/month";
import { horizonRows } from "@/features/simulation/projection";

import { isMobile, loadHousehold, loginAs, seedFor, statValue, toast } from "./helpers";

const GOAL = { name: "E2E 가전 교체", target: 2_000_000, saved: 500_000 };

test("목표를 추가하면 달성률이 보인다", async ({ page }, testInfo) => {
  const seed = seedFor(testInfo.project.name);
  await loginAs(page, seed);
  await page.goto("/goals");
  await expect(page.getByRole("heading", { level: 1, name: "목표", exact: true })).toBeVisible();

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
    const data = await loadHousehold(seed.ownerEmail, seed.password);
    const goal = data.goals.find((candidate) => candidate.name === GOAL.name)!;
    const progress = goalsView(data, currentYm()).progress.find((candidate) => candidate.goalId === goal.id)!;
    expect(progress.percent).toBe(25);

    const card = page.locator('[data-slot="card"]').filter({ has: page.getByText(GOAL.name, { exact: true }) });
    await expect(card.getByRole("progressbar", { name: `${GOAL.name} 달성률` })).toHaveAttribute("aria-valuenow", String(progress.percent));
    await expect(card.getByText(formatPercent(progress.percent), { exact: true })).toBeVisible();
    await expect(card.getByText(formatWon(GOAL.saved), { exact: true })).toBeVisible();
  });

  await test.step("정리: 목표 삭제", async () => {
    await page.getByRole("button", { name: `${GOAL.name} 메뉴` }).click();
    await page.getByRole("menuitem", { name: "삭제" }).click();
    await page
      .getByRole("alertdialog", { name: `'${GOAL.name}' 목표를 삭제할까요?` })
      .getByRole("button", { name: "삭제", exact: true })
      .click();
    await expect(toast(page, "목표를 삭제했습니다")).toBeVisible();
    await expect(page.getByText(GOAL.name, { exact: true })).toHaveCount(0);
  });
});

test("시뮬레이션 가정을 바꾸면 요약 숫자가 바뀌고, 실제 기록은 그대로다", async ({ page }, testInfo) => {
  const seed = seedFor(testInfo.project.name);
  const data = await loadHousehold(seed.ownerEmail, seed.password);
  const assetsBefore = currentPosition(data).totals.assets;

  await loginAs(page, seed);
  await page.goto("/simulation");
  await expect(page.getByRole("heading", { level: 1, name: "미래 시뮬레이션" })).toBeVisible();
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
    const after = await loadHousehold(seed.ownerEmail, seed.password);
    expect(currentPosition(after).totals.assets).toBe(assetsBefore);
    expect(resolveAssumptions(baseScenario(after)!.assumptions).monthlySavingsAdjust).toBe(500_000);
    await page.goto("/assets");
    await expect(statValue(page, "총자산")).toHaveText(formatWon(assetsBefore));
  });

  await test.step("정리: 가정을 되돌린다", async () => {
    await page.goto("/simulation");
    if (isMobile(testInfo)) await page.getByRole("button", { name: /^가정 펼치기/ }).click();
    await page.getByRole("textbox", { name: "월 저축 조정액" }).fill("0");
    await expect(tenYears(page)).toHaveText(formatCompactWon(expectedTenYears(data, {})));
    await expect(page.getByText("자동 저장", { exact: true })).toBeVisible();
    await expect
      .poll(async () => resolveAssumptions(baseScenario(await loadHousehold(seed.ownerEmail, seed.password))!.assumptions).monthlySavingsAdjust)
      .toBe(0);
  });
});

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
