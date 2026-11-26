import { expect, test, type Page } from "@playwright/test";

import { findMonth, planForMonth, reportFor } from "@/lib/data/derive";
import type { HouseholdData } from "@/lib/data/types";
import type { Ym } from "@/lib/finance/types";
import { formatMonthOnly, formatWon, formatYm } from "@/lib/format";
import { addMonths, currentYm, ymParts } from "@/lib/month";
import { rowIdOf } from "@/features/settlement/model";

import type { SeedResult } from "../../scripts/seed-demo";
import { loadHousehold, loginAs, removeHousehold, seedOwnHousehold, statValue, toast } from "./helpers";

/** 계획 항목을 추가·수정·삭제하므로 이 스펙 전용 가구를 쓴다 */
let seed: SeedResult | undefined;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  seed = await seedOwnHousehold("plan", testInfo);
});

test.afterAll(async () => {
  await removeHousehold(seed);
});

const THIS_MONTH = currentYm();
const WORKING = addMonths(THIS_MONTH, -1);
const ITEM = { name: "E2E 동영상 구독", amount: 37_000, edited: 52_000 };

const load = () => loadHousehold(seed!.ownerEmail, seed!.password);
const allowanceOf = (data: HouseholdData, ym: Ym) => planForMonth(data, ym).members.find((member) => member.memberId === data.me.id)!.allowance;

/** 본인(하늘)의 계획 카드 */
function myCard(page: Page) {
  return page.locator('[data-slot="card"]').filter({ hasText: "개인 사용 가능 금액" }).filter({ hasText: "하늘 급여" });
}

/** 본인(하늘) 카드의 개인 사용 가능 금액 */
function myAllowance(page: Page) {
  return statValue(myCard(page), "개인 사용 가능 금액");
}

async function openPlan(page: Page) {
  await page.goto("/plan");
  await expect(page.getByRole("heading", { level: 1, name: "월급·배분" })).toBeVisible();
}

test("고정지출을 추가·수정·사용 중지·삭제하면 개인 사용 가능 금액이 따라 바뀐다", async ({ page }) => {
  const before = allowanceOf(await load(), THIS_MONTH);

  await loginAs(page, seed!);
  await openPlan(page);
  await expect(myAllowance(page)).toHaveText(formatWon(before));

  await test.step("추가", async () => {
    await page.getByRole("button", { name: "항목 추가" }).first().click();
    const dialog = page.getByRole("dialog", { name: "계획 항목 추가" });
    await dialog.getByLabel("종류").selectOption({ label: "고정지출" });
    await expect(dialog.getByRole("radio", { name: "하늘" })).toBeChecked();
    // 빈 값으로 저장하면 첫 오류 칸으로 포커스가 간다
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(dialog.getByText("이름을 입력해 주세요.")).toBeVisible();
    await expect(dialog.getByLabel("이름")).toBeFocused();

    await dialog.getByLabel("이름").fill(ITEM.name);
    await dialog.getByLabel("금액", { exact: true }).fill(String(ITEM.amount));
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(toast(page, "항목을 추가했습니다")).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(myAllowance(page)).toHaveText(formatWon(before - ITEM.amount));
    expect(allowanceOf(await load(), THIS_MONTH)).toBe(before - ITEM.amount);
  });

  await test.step("금액 수정 (처음부터 수정)", async () => {
    await page.getByRole("button", { name: new RegExp(`^${ITEM.name}`) }).click();
    const dialog = page.getByRole("dialog", { name: "고정지출 수정" });
    await dialog.getByLabel("금액", { exact: true }).fill(String(ITEM.edited));
    await dialog.getByRole("radio", { name: "처음부터 수정" }).click();
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(toast(page, "저장했습니다")).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(myAllowance(page)).toHaveText(formatWon(before - ITEM.edited));
    const data = await load();
    expect(data.planItems.filter((item) => item.name === ITEM.name)).toHaveLength(1);
    expect(allowanceOf(data, THIS_MONTH)).toBe(before - ITEM.edited);
  });

  await test.step("사용 중지 → 이 달에 빠진 항목으로 옮겨지고 금액이 돌아온다", async () => {
    await page.getByRole("button", { name: new RegExp(`^${ITEM.name}`) }).click();
    const dialog = page.getByRole("dialog", { name: "고정지출 수정" });
    const active = dialog.getByRole("switch", { name: "사용" });
    await expect(active).toBeChecked();
    await active.click();
    await expect(active).not.toBeChecked();
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(toast(page, "저장했습니다")).toBeVisible();
    await expect(dialog).toBeHidden();

    await expect(myAllowance(page)).toHaveText(formatWon(before));
    const unused = page.locator('[data-slot="card"]').filter({ has: page.getByText("이 달에 빠진 항목", { exact: true }) });
    const row = unused.getByRole("button", { name: new RegExp(`^${ITEM.name}`) });
    await expect(row).toContainText("사용 안 함");
    await expect(row).toContainText(formatWon(ITEM.edited));
    const data = await load();
    expect(data.planItems.find((item) => item.name === ITEM.name)!.is_active).toBe(false);
    expect(allowanceOf(data, THIS_MONTH)).toBe(before);
  });

  await test.step("삭제", async () => {
    await page.getByRole("button", { name: new RegExp(`^${ITEM.name}`) }).click();
    const dialog = page.getByRole("dialog", { name: "고정지출 수정" });
    await dialog.getByRole("button", { name: "항목 삭제" }).click();
    const confirm = page.getByRole("alertdialog", { name: `'${ITEM.name}' 항목을 삭제할까요?` });
    await confirm.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(toast(page, "삭제했습니다")).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`^${ITEM.name}`) })).toHaveCount(0);
    expect((await load()).planItems.some((item) => item.name === ITEM.name)).toBe(false);
  });
});

test("○월부터 변경: 지난 달 계획은 그대로, 이미 확인한 실제 수입은 새 항목에 이어져 두 번 잡히지 않는다", async ({ page }) => {
  const salary = { old: 4_300_000, next: 4_500_000 };
  const before = await load();
  const original = before.planItems.find((item) => item.name === "하늘 급여")!;
  expect(original.amount).toBe(salary.old);
  const otherIncome = (data: HouseholdData) =>
    reportFor(data, findMonth(data, WORKING)!).incomeLines.filter((line) => line.name !== "하늘 급여" && line.planned !== null);

  await loginAs(page, seed!);

  await test.step(`${formatMonthOnly(WORKING)} 정산에서 하늘 급여를 계획대로 확인`, async () => {
    await page.goto("/settlement");
    await expect(page.getByText(`${formatMonthOnly(WORKING)} 정산 진행`)).toBeVisible();
    const line = reportFor(before, findMonth(before, WORKING)!).incomeLines.find((candidate) => candidate.name === "하늘 급여")!;
    const row = page.locator(`[id="${rowIdOf("income", line.key)}"]`);
    await row.getByRole("button", { name: "계획대로" }).click();
    await expect(row.getByRole("button", { name: "하늘 급여 수정" })).toContainText(formatWon(salary.old));
  });

  await test.step(`/plan 에서 ${formatMonthOnly(WORKING)}부터 급여 인상`, async () => {
    await openPlan(page);
    await page.getByRole("button", { name: "이전 달" }).click();
    await expect(page.getByRole("group", { name: "월 선택" })).toContainText(formatYm(WORKING));
    await myCard(page).getByRole("button", { name: /^하늘 급여/ }).click();
    const dialog = page.getByRole("dialog", { name: "수입 수정" });
    await dialog.getByLabel("금액", { exact: true }).fill(String(salary.next));
    await expect(dialog.getByRole("radio", { name: `${formatMonthOnly(WORKING)}부터` })).toBeChecked();
    await expect(dialog.getByText(`${formatMonthOnly(WORKING)}부터 이미 확인한 실제 금액은 바뀐 항목으로 이어집니다.`, { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(toast(page, `${formatYm(WORKING)}부터 바꿨습니다`)).toBeVisible();
    await expect(dialog).toBeHidden();
  });

  const after = await load();
  await test.step("데이터: 옛 항목은 전월에 끝나고, 확인한 실제 값은 새 항목을 가리킨다", async () => {
    const ended = after.planItems.find((item) => item.id === original.id)!;
    expect(ended.end_month).toBe(addMonths(WORKING, -1));
    expect(ended.amount).toBe(salary.old);
    const created = after.planItems.find((item) => item.name === "하늘 급여" && item.id !== original.id)!;
    expect(created.start_month).toBe(WORKING);
    expect(created.amount).toBe(salary.next);

    const entries = after.monthData[findMonth(after, WORKING)!.id].entries.filter((entry) => entry.kind === "income" && entry.name === "하늘 급여");
    expect(entries).toHaveLength(1);
    expect(entries[0].plan_item_id).toBe(created.id);
    expect(entries[0].amount).toBe(salary.old);

    const report = reportFor(after, findMonth(after, WORKING)!);
    const lines = report.incomeLines.filter((line) => line.name === "하늘 급여");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ planned: salary.next, actual: salary.old });
    // 계획에 없던 수입(기타 수입)으로 다시 잡히지 않는다
    expect(report.incomeLines.filter((line) => line.planned === null)).toEqual([]);

    // 지난 달(마감)과 그 이전 계획은 옛 금액, 이번 달부터는 새 금액
    const salaryIn = (ym: Ym) => planForMonth(after, ym).lines.filter((line) => line.kind === "income" && line.name === "하늘 급여").map((line) => line.amount);
    expect(salaryIn(addMonths(WORKING, -1))).toEqual([salary.old]);
    expect(salaryIn(WORKING)).toEqual([salary.next]);
    expect(salaryIn(THIS_MONTH)).toEqual([salary.next]);
  });

  await test.step("화면: 월별 계획에 각 달의 금액이 보인다", async () => {
    await openPlan(page);
    // 그 달에 적용되지 않는 쪽 항목은 "이 달에 빠진 항목"에 있으므로 하늘 카드 안에서 찾는다
    // (마감한 달은 고칠 수 없어 버튼이 아닌 목록 줄로 보인다)
    const salaryRow = myCard(page).getByRole("listitem").filter({ hasText: /^하늘 급여/ });
    await expect(salaryRow).toHaveCount(1);
    await expect(salaryRow).toContainText(formatWon(salary.next));
    await page.getByRole("button", { name: "이전 달" }).click();
    await expect(salaryRow).toContainText(formatWon(salary.next));
    await page.getByRole("button", { name: "이전 달" }).click();
    await expect(page.getByRole("group", { name: "월 선택" })).toContainText(formatYm(addMonths(WORKING, -1)));
    await expect(salaryRow).toContainText(formatWon(salary.old));
    await expect(page.getByText("마감할 때 동결한 계획입니다.", { exact: false })).toBeVisible();
  });

  await test.step("정산: 하늘 급여 줄은 하나뿐이고, 나머지 수입을 확인하면 총수입에 한 번만 들어간다", async () => {
    await page.goto("/settlement");
    const income = page.locator("#section-income");
    await expect(income.getByRole("button", { name: "하늘 급여 수정" })).toHaveCount(1);
    await expect(income.getByRole("button", { name: "하늘 급여 수정" })).toContainText(formatWon(salary.old));
    await expect(income).toContainText(`계획 ${formatWon(salary.next)}`);
    // "기타 수입" 글자는 추가 버튼에만 있다 (계획에 없던 수입 줄이 생기지 않았다)
    await expect(income.locator("span").getByText("기타 수입", { exact: true })).toHaveCount(0);
    await expect(income.getByRole("button", { name: "기타 수입", exact: true })).toHaveCount(1);

    for (const line of otherIncome(after)) {
      await page.locator(`[id="${rowIdOf("income", line.key)}"]`).getByRole("button", { name: "계획대로" }).click();
      await expect(income.getByRole("button", { name: `${line.name} 수정` })).toBeVisible();
    }
    const done = await load();
    const report = reportFor(done, findMonth(done, WORKING)!);
    const bada = 3_100_000 + ([1, 7].includes(ymParts(WORKING).month) ? 2_000_000 : 0);
    expect(report.incomeLines.every((line) => line.actual !== null)).toBe(true);
    expect(report.income).toBe(salary.old + bada);
  });
});

test("공용통장 화면이 열린다", async ({ page }) => {
  await loginAs(page, seed!);
  await openPlan(page);
  await page.getByRole("navigation", { name: "월급 메뉴" }).getByRole("link", { name: "공용통장" }).click();
  await expect(page).toHaveURL(/\/joint$/);
  await expect(page.getByRole("heading", { level: 1, name: "공용통장" })).toBeVisible();
  await expect(page.getByText("공동저축").first()).toBeVisible();
});
