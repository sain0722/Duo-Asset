import { expect, test, type Locator, type Page } from "@playwright/test";

import { findMonth, planForMonth, reportFor } from "@/lib/data/derive";
import type { HouseholdData } from "@/lib/data/types";
import { ASSET_KINDS } from "@/lib/finance";
import { suggestInputs } from "@/lib/finance/suggest";
import { JOINT, type MonthReport, type Ym } from "@/lib/finance/types";
import { formatCompactWon, formatMonthOnly, formatPercent, formatWon } from "@/lib/format";
import { addMonths, currentYm } from "@/lib/month";
import { BALANCE_JUMP_HINT, checklist, planComparison, rowIdOf, pocketUsage, remainingAfter, savingsAchievement, suggestionRows, type CheckItem } from "@/features/settlement/model";

import type { SeedResult } from "../../scripts/seed-demo";
import { definitionValue, isMobile, loadHousehold, loginAs, removeHousehold, seedOwnHousehold, statValue, toast } from "./helpers";

/**
 * 월 정산 전체 흐름 (이 스펙 전용 가구에서).
 * 시드 상태: 지난달(정산할 달)은 자산 2개만 확인됐고, 이번 달은 아직 없다.
 */
const THIS_MONTH = currentYm();
const WORKING = addMonths(THIS_MONTH, -1);
const NEXT_OF_THIS = addMonths(THIS_MONTH, 1);

let seed: SeedResult | undefined;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  seed = await seedOwnHousehold("settle", testInfo);
});

test.afterAll(async () => {
  await removeHousehold(seed);
});

test("정산: 한 번에 확인 → 잔액 입력 → 결과 대조 → 마감 → 다음 달 → 이력 → 마감 취소 → 다시 마감", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const mobile = isMobile(testInfo);
  const account = seed!;
  const load = () => loadHousehold(account.ownerEmail, account.password);
  const label = formatMonthOnly(WORKING);
  const nextLabel = formatMonthOnly(THIS_MONTH);

  await loginAs(page, account);
  await page.goto("/settlement");
  await expect(page.getByRole("heading", { level: 1, name: "월 정산" })).toBeVisible();
  await expect(page.getByText(`${label} 정산 진행`)).toBeVisible();

  await test.step("미확인은 0원으로 보이지 않는다 (결과는 정산 전, 이력도 정산 전)", async () => {
    const data = await load();
    const draft = reportFor(data, findMonth(data, WORKING)!);
    expect(draft.complete).toBe(false);
    const result = page.locator("#section-result");
    await expect(result.getByText("정산 전", { exact: true })).toBeVisible();
    await expect(result.getByText(/^미확인 \d+건을 확인하면 결과가 계산됩니다\.$/)).toBeVisible();
    await expect(result.getByText("실제 저축액", { exact: true })).toHaveCount(0);
    await expect(result.getByText("0원", { exact: true })).toHaveCount(0);
    // 아직 확인하지 않은 잔액 칸은 비어 있다 (0 이나 계획값으로 채우지 않는다)
    const unconfirmed = draft.assetLines.find((line) => !line.confirmed && ASSET_KINDS[line.kind].tracking !== "valuation")!;
    expect(unconfirmed).toBeDefined();
    await expect(page.getByRole("textbox", { name: `${unconfirmed.name} 잔액`, exact: true })).toHaveValue("");

    const entry = await historyEntry(page, mobile, label);
    await expect(entry).toContainText("정산 전");
    await expect(entry).toContainText("수입·소비는 정산 후 표시");
    await expect(entry).not.toContainText("수입 0");
    if (mobile) await page.getByRole("button", { name: /^정산 이력/ }).click();
  });

  await test.step("예정대로 한 번에 확인", async () => {
    await confirmSuggestions(page, await load(), WORKING);
  });

  await test.step("남은 통장·투자자산 잔액을 직접 입력", async () => {
    await fillRemaining(page, await load(), WORKING, mobile);
    await expect(page.getByText("모두 확인했어요. 결과를 보고 마감하세요.")).toBeVisible();
    await expect(page.getByText("마감 가능", { exact: true })).toBeVisible();
  });

  let report: MonthReport;
  await test.step("결과 숫자가 lib 계산(reportFor)과 같다", async () => {
    const data = await load();
    report = reportFor(data, findMonth(data, WORKING)!);
    expect(report.complete).toBe(true);
    const result = page.locator("#section-result");
    await expect(result.getByText("정산 전")).toHaveCount(0);
    await expectReport(result, report);
  });

  await test.step("마감하면 결과가 고정되고, 토스트로 다음 달을 연다", async () => {
    await closeMonthOnScreen(page, label);
    await expect(toast(page, `${label} 정산을 마감했습니다`)).toBeVisible();
    // 마감 직후에는 방금 마감한 달의 결과에 머문다
    await expect(page).toHaveURL(new RegExp(`month=${WORKING}`));
    await expect(page.getByText("마감 당시 결과를 그대로 보여 줍니다.", { exact: false })).toBeVisible();

    await toast(page, `${label} 정산을 마감했습니다`).getByRole("button", { name: `${nextLabel} 정산하기` }).click();
    await expect(page).toHaveURL(new RegExp(`month=${THIS_MONTH}`));
    await expect(page.getByText(`${nextLabel} 정산 진행`)).toBeVisible();
  });

  await test.step("마감한 달은 동결된 결과(months.summary)를 보여 준다", async () => {
    const data = await load();
    const closed = findMonth(data, WORKING)!;
    expect(closed.status).toBe("closed");
    expect(findMonth(data, THIS_MONTH)?.status).toBe("open");
    await page.getByRole("button", { name: "이전 달" }).click();
    await expect(page).toHaveURL(new RegExp(`month=${WORKING}`));
    await expect(page.getByRole("heading", { name: `${label} 결과` })).toBeVisible();
    await expectReport(page.locator("main"), reportFor(data, closed));
  });

  await test.step("이력에 마감한 달과 수치가 보인다", async () => {
    const entry = await historyEntry(page, mobile, label);
    await expect(entry).toContainText("마감");
    await expect(entry).toContainText(`수입 ${formatCompactWon(report.income)}`);
    await expect(entry).toContainText(`소비 ${formatCompactWon(report.consumption)}`);
    await expect(entry).toContainText(`저축 ${formatCompactWon(report.savings)}`);
    await expect(entry).toContainText(formatCompactWon(report.closing.netWorth));
    if (mobile) await page.getByRole("button", { name: /^정산 이력/ }).click();
  });

  await test.step("마감 취소 → 다시 마감", async () => {
    await page.getByRole("button", { name: "마감 취소" }).click();
    const dialog = page.getByRole("alertdialog", { name: `${label} 마감을 취소할까요?` });
    await dialog.getByRole("button", { name: "마감 취소" }).click();
    await expect(toast(page, `${label} 정산을 다시 열었습니다`)).toBeVisible();
    await expect(page.getByText("마감 가능", { exact: true })).toBeVisible();
    expect(findMonth(await load(), WORKING)?.status).toBe("open");

    // 다시 연 달에서도 결과는 같다
    await expectReport(page.locator("#section-result"), report);
    await closeMonthOnScreen(page, label);
    await expect(toast(page, `${label} 정산을 마감했습니다`)).toBeVisible();
    await expect(page.getByText("마감 당시 결과를 그대로 보여 줍니다.", { exact: false })).toBeVisible();
    const data = await load();
    expect(findMonth(data, WORKING)?.status).toBe("closed");
    expect(reportFor(data, findMonth(data, WORKING)!)).toEqual(report);
  });

  await test.step("아직 끝나지 않은 이번 달은 다 확인해도 마감할 수 없고 이유를 보여 준다", async () => {
    await page.getByRole("button", { name: "다음 달" }).click();
    await expect(page).toHaveURL(new RegExp(`month=${THIS_MONTH}`));
    await expect(page.getByText(`${nextLabel}은 아직 끝나지 않은 달이에요.`)).toBeVisible();
    await expect(closeButton(page, nextLabel)).toBeDisabled();

    await confirmSuggestions(page, await load(), THIS_MONTH);
    await fillRemaining(page, await load(), THIS_MONTH, mobile);
    await expect(page.getByText("모두 확인했어요.", { exact: true })).toBeVisible();
    expect(reportFor(await load(), findMonth(await load(), THIS_MONTH)!).complete).toBe(true);

    // 자릿수 실수(전월의 1/10)는 확인한 줄 아래에 안내하고, 고치면 사라진다
    const current = reportFor(await load(), findMonth(await load(), THIS_MONTH)!);
    const cash = current.assetLines.find((line) => ASSET_KINDS[line.kind].tracking !== "valuation" && line.openValue >= 2_000_000)!;
    expect(cash).toBeDefined();
    const row = page.locator(`[id="${rowIdOf("asset", cash.assetId)}"]`);
    await row.getByRole("button", { name: `${cash.name} 수정` }).click();
    const balance = row.getByRole("textbox", { name: `${cash.name} 잔액`, exact: true });
    await balance.fill(String(Math.round(cash.openValue / 10)));
    await balance.press("Enter");
    await expect(row.getByText(BALANCE_JUMP_HINT.drop)).toBeVisible();
    await row.getByRole("button", { name: `${cash.name} 수정` }).click();
    await balance.fill(String(cash.value));
    await balance.press("Enter");
    await expect(row.getByRole("button", { name: `${cash.name} 수정` })).toBeVisible();
    await expect(row.getByText(BALANCE_JUMP_HINT.drop)).toHaveCount(0);
    expect(reportFor(await load(), findMonth(await load(), THIS_MONTH)!).assetLines.find((line) => line.assetId === cash.assetId)!.value).toBe(cash.value);

    await expect(closeButton(page, nextLabel)).toBeDisabled();
    const after = formatMonthOnly(NEXT_OF_THIS);
    await expect(closeButton(page, nextLabel)).toHaveCount(1);
    if (mobile) {
      await expect(page.locator(".fixed").getByText(`${after} 1일부터 마감할 수 있어요`)).toBeVisible();
    } else {
      // PC: 마감 버튼과 이유는 왼쪽의 고정 진행 카드에 있다
      const progress = page.getByRole("region", { name: `${nextLabel} 정산 진행` });
      await expect(progress.getByRole("button", { name: `${nextLabel} 마감`, exact: true })).toBeDisabled();
      await expect(progress.getByText(`${nextLabel}이 끝난 뒤 ${after} 1일부터 마감할 수 있습니다. 입력은 미리 해 두세요.`)).toBeVisible();
    }
  });

  await test.step("계획 설정을 바꿔도 마감한 달은 마감 당시 결과를 보여 준다 (설정 화면 · 홈)", async () => {
    const before = await load();
    const living = before.planItems.find((item) => item.name === "공동생활비" && item.member_id === null)!;
    const raised = living.amount + 600_000;
    await page.goto("/plan");
    await expect(page.getByRole("heading", { level: 1, name: "월급·배분" })).toBeVisible();
    await page.getByRole("button", { name: /^공동생활비/ }).first().click();
    const dialog = page.getByRole("dialog", { name: "고정지출 수정" });
    await dialog.getByLabel("금액", { exact: true }).fill(String(raised));
    // 마감한 달까지 거슬러 바꾸는 쪽(처음부터 수정)을 골라도 마감한 달은 그대로여야 한다
    await dialog.getByRole("radio", { name: "처음부터 수정" }).click();
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(toast(page, "저장했습니다")).toBeVisible();
    await expect(dialog).toBeHidden();

    const after = await load();
    expect(after.planItems.find((item) => item.id === living.id)!.amount).toBe(raised);
    // 지금 설정(열린 달)의 계획 소비는 늘었다 → 마감한 달이 동결값을 보여 주는지 구별된다
    const planNow = planForMonth(after, THIS_MONTH).totals;
    expect(planNow.consumption).toBe(planForMonth(before, THIS_MONTH).totals.consumption + 600_000);
    expect(reportFor(after, findMonth(after, WORKING)!)).toEqual(report);

    await page.goto(`/settlement?month=${WORKING}`);
    await expect(page.getByRole("heading", { name: `${label} 결과` })).toBeVisible();
    await expectReport(page.locator("main"), report);

    await page.goto("/");
    const card = page.locator('[data-slot="card"]').filter({ has: page.getByText(`${label} 정산 결과`, { exact: true }) });
    await expect(statValue(card, "실제 저축액")).toHaveText(formatWon(report.savings));
    await expect(card.locator('[data-slot="stat"]').first()).toContainText(`계획 ${formatWon(report.plan.savings)}`);
    // 이번 달 계획 카드는 바뀐 설정을 따른다
    await expect(statValue(page, "계획 저축액")).toHaveText(formatCompactWon(planNow.savings));
    expect(planNow.savings).not.toBe(report.plan.savings);
  });
});

// ───────────────────────── 도우미 ─────────────────────────

const pocketsOf = (data: HouseholdData) => [...data.members.map((member) => member.id), JOINT];

/** "예정대로 N건 한 번에 확인" → 확인 창 → 저장. N 은 앱과 같은 suggestionRows 로 구한다. */
async function confirmSuggestions(page: Page, data: HouseholdData, ym: Ym) {
  const report = reportFor(data, findMonth(data, ym)!);
  const rows = suggestionRows(suggestInputs(report), report);
  const items = checklist(report, pocketsOf(data));
  const done = items.filter((item) => item.done).length;
  expect(rows.length).toBeGreaterThan(0);

  await expect(page.getByRole("progressbar", { name: "정산 진행률" })).toBeVisible();
  await expect(progressText(page, items.length)).toHaveText(new RegExp(`^${done}\\s*/ ${items.length} 확인$`));

  await page.getByRole("button", { name: `예정대로 ${rows.length}건 한 번에 확인` }).click();
  const dialog = page.getByRole("dialog", { name: `예정대로 ${rows.length}건 확인` });
  await expect(dialog).toBeVisible();
  // 줄마다 무엇을 · 얼마로 · 왜 (앱과 같은 suggestionRows 로 만든 기대값)
  const lines = dialog.getByRole("listitem");
  await expect(lines).toHaveCount(rows.length);
  for (const [index, row] of rows.entries()) {
    const line = lines.nth(index);
    await expect(line).toContainText(row.name);
    await expect(line).toContainText(row.reason);
    await expect(line).toContainText(formatWon(row.amount));
  }
  // 공용통장 납입은 "하늘 → 공용통장" 처럼 보낸 사람으로 표시한다
  for (const row of rows.filter((candidate) => candidate.section === "transfers")) expect(row.name).toMatch(/^\S+ → 공용통장$/);
  await expect(dialog).not.toContainText("입금 입금");
  await dialog.getByRole("button", { name: `${rows.length}건 확인` }).click();

  await expect(toast(page, `${rows.length}건을 예정대로 확인했습니다`)).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /^예정대로 \d+건 한 번에 확인$/ })).toHaveCount(0);
  await expect(progressText(page, items.length)).toHaveText(new RegExp(`^${done + rows.length}\\s*/ ${items.length} 확인$`));
}

/** 한 번에 확인으로 채울 수 없는 항목(통장·투자자산 등)을 행에서 직접 입력한다 */
async function fillRemaining(page: Page, data: HouseholdData, ym: Ym, mobile: boolean) {
  const report = reportFor(data, findMonth(data, ym)!);
  const items = checklist(report, pocketsOf(data));
  const remaining = remainingAfter(items, []).filter((item) => !item.done);
  expect(remaining.length).toBeGreaterThan(0);

  for (const [index, item] of remaining.entries()) {
    const input = await rowInput(page, report, item, mobile);
    if (index === 0) {
      // 한 번에 확인 직후 포커스는 첫 미확인 행에 있다
      await expect(input).toBeFocused();
    }
    await input.fill(String(virtualAmount(report, item)));
    await input.press("Enter");
    await expect(page.getByRole("button", { name: `${item.label} 수정` })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "저장됨" })).toBeVisible();
  }
}

/** 행의 입력칸. 모바일에서는 영역이 접혀 있을 수 있어 먼저 펼친다. */
async function rowInput(page: Page, report: MonthReport, item: CheckItem, mobile: boolean): Promise<Locator> {
  if (mobile) {
    const header = page.locator(`#section-${item.section} > button[aria-expanded]`);
    if ((await header.getAttribute("aria-expanded")) === "false") await header.click();
  }
  if (item.section === "assets") {
    const line = report.assetLines.find((candidate) => candidate.name === item.label)!;
    const valuation = ASSET_KINDS[line.kind].tracking === "valuation";
    return page.getByRole("textbox", { name: `${line.name} ${valuation ? "평가금액" : "잔액"}`, exact: true });
  }
  if (item.section === "liabilities") return page.getByRole("textbox", { name: `${item.label} 남은 원금`, exact: true });
  return page.getByRole("textbox", { name: `${item.label} 실제 금액`, exact: true });
}

/** 가상의 월말 값: 전월 값에서 조금 바꾼다 */
function virtualAmount(report: MonthReport, item: CheckItem): number {
  if (item.section === "assets") {
    const line = report.assetLines.find((candidate) => candidate.name === item.label)!;
    return line.openValue + 130_000;
  }
  if (item.section === "liabilities") return report.liabilityLines.find((line) => line.name === item.label)!.openBalance;
  return 1_000_000;
}

/** 진행 카드의 "N / M 확인" */
function progressText(page: Page, total: number): Locator {
  return page.locator("p").filter({ hasText: `/ ${total} 확인` });
}

/** 결과 카드의 숫자가 report 와 같다 (화면 문자열을 format 함수 결과와 맞춘다) */
async function expectReport(scope: Locator, report: MonthReport) {
  const page = scope.page();
  const savings = scope.locator('[data-slot="stat"]').filter({ has: page.locator("span", { hasText: /^실제 저축액$/ }) });
  await expect(savings.locator('[data-slot="money"]').first()).toHaveText(formatWon(report.savings));
  // 저축률과 계획 대비 달성률
  expect(report.savingsRate).not.toBeNull();
  await expect(savings).toContainText(`저축률 ${formatPercent(report.savingsRate!)}`);
  const achievement = savingsAchievement(report);
  if (achievement !== null) await expect(savings).toContainText(`계획 대비 ${formatPercent(achievement)}`);

  await expect(definitionValue(scope, "총수입")).toHaveText(formatWon(report.income));
  await expect(definitionValue(scope, "소비지출")).toHaveText(formatWon(report.consumption));
  await expect(definitionValue(scope, "원금 상환액")).toHaveText(formatWon(report.principalRepaid));
  await expect(definitionValue(scope, "투자 평가손익")).toHaveText(formatWon(report.investmentGain, { sign: true }));
  await expect(definitionValue(scope, "기타 평가 변동")).toHaveText(formatWon(report.otherValuation, { sign: true }));
  // 순자산: 변화량과 월초 → 월말 값
  const netWorth = scope
    .locator("div")
    .filter({ has: page.getByText("순자산 변화", { exact: true }) })
    .filter({ hasText: "에서" })
    .last();
  await expect(netWorth.locator('[data-slot="delta"]')).toHaveText(
    `${report.netWorthChange > 0 ? "증가" : report.netWorthChange < 0 ? "감소" : ""}${formatWon(Math.abs(report.netWorthChange))}`,
  );
  await expect(netWorth).toContainText(formatCompactWon(report.closing.netWorth));
  await expect(netWorth).toContainText(formatCompactWon(report.opening.netWorth));

  // 계획 대비 실적 (마감한 달은 동결된 계획 값)
  const comparison = scope.locator("section").filter({ has: page.getByRole("heading", { name: "계획 대비 실적" }) });
  for (const row of planComparison(report)) {
    const item = comparison.getByRole("listitem").filter({ has: page.getByText(row.label, { exact: true }) });
    await expect(item, row.label).toContainText(`계획 ${formatCompactWon(row.planned)}`);
    await expect(item.locator('[data-slot="money"]').last(), row.label).toHaveText(formatCompactWon(row.actual));
  }

  // 주머니별 소비
  const pockets = scope.locator("section").filter({ has: page.getByRole("heading", { name: "주머니별 소비" }) });
  await expect(pockets.getByRole("listitem")).toHaveCount(report.pockets.length);
  for (const [index, pocket] of report.pockets.entries()) {
    const item = pockets.getByRole("listitem").nth(index);
    await expect(item.locator('[data-slot="money"]').first(), pocket.name).toHaveText(formatWon(pocket.consumption));
    await expect(item, pocket.name).toContainText(`계획 ${formatCompactWon(pocket.plannedConsumption)}`);
    const usage = pocketUsage(pocket);
    if (usage !== null) await expect(item, pocket.name).toContainText(formatPercent(usage));
  }
}

/** 화면 크기에 따라 보이는 쪽(모바일 하단 바 / PC 결과 카드)의 마감 버튼 */
function closeButton(page: Page, label: string): Locator {
  return page.getByRole("button", { name: `${label} 마감`, exact: true }).filter({ visible: true });
}

async function closeMonthOnScreen(page: Page, label: string) {
  // 화면마다 보이는 마감 버튼은 하나뿐이다 (PC: 왼쪽 진행 카드, 모바일: 하단 고정 바)
  await expect(closeButton(page, label)).toHaveCount(1);
  await expect(closeButton(page, label)).toBeEnabled();
  await closeButton(page, label).click();
  const dialog = page.getByRole("alertdialog", { name: `${label} 정산을 마감할까요?` });
  await dialog.getByRole("button", { name: "마감", exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** 정산 이력에서 그 달의 항목 (PC: 왼쪽 목록, 모바일: 접이식) */
async function historyEntry(page: Page, mobile: boolean, label: string): Promise<Locator> {
  let list: Locator;
  if (mobile) {
    const toggle = page.getByRole("button", { name: /^정산 이력/ });
    if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
    list = page.locator(`[id="${await toggle.getAttribute("aria-controls")}"]`);
  } else {
    list = page.getByRole("complementary", { name: "정산 이력" });
  }
  return list.getByRole("button").filter({ hasText: new RegExp(`^${label}`) });
}
