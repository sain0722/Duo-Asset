import { expect, test, type Page } from "@playwright/test";

import { planForMonth } from "@/lib/data/derive";
import { formatWon } from "@/lib/format";
import { currentYm } from "@/lib/month";

import { loadHousehold, loginAs, seedFor, statValue, toast } from "./helpers";

const ITEM = { name: "E2E 동영상 구독", amount: 37_000 };

/** 본인(하늘) 카드의 개인 사용 가능 금액 */
function myAllowance(page: Page) {
  const card = page.locator('[data-slot="card"]').filter({ hasText: "개인 사용 가능 금액" }).filter({ hasText: "하늘 급여" });
  return statValue(card, "개인 사용 가능 금액");
}

test("고정지출을 추가하면 개인 사용 가능 금액이 그만큼 줄고, 삭제하면 돌아온다", async ({ page }, testInfo) => {
  const seed = seedFor(testInfo.project.name);
  const data = await loadHousehold(seed.ownerEmail, seed.password);
  const before = planForMonth(data, currentYm()).members.find((member) => member.memberId === data.me.id)!.allowance;

  await loginAs(page, seed);
  await page.goto("/plan");
  await expect(page.getByRole("heading", { level: 1, name: "월급·배분" })).toBeVisible();
  await expect(myAllowance(page)).toHaveText(formatWon(before));

  await test.step("고정지출 추가", async () => {
    await page.getByRole("button", { name: "항목 추가" }).first().click();
    const dialog = page.getByRole("dialog", { name: "계획 항목 추가" });
    await dialog.getByLabel("종류").selectOption({ label: "고정지출" });
    await expect(dialog.getByRole("radio", { name: "하늘" })).toBeChecked();
    await dialog.getByLabel("이름").fill(ITEM.name);
    await dialog.getByLabel("금액", { exact: true }).fill(String(ITEM.amount));
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(toast(page, "항목을 추가했습니다")).toBeVisible();
    await expect(dialog).toBeHidden();
  });

  await expect(myAllowance(page)).toHaveText(formatWon(before - ITEM.amount));
  const added = await loadHousehold(seed.ownerEmail, seed.password);
  expect(planForMonth(added, currentYm()).members.find((member) => member.memberId === added.me.id)!.allowance).toBe(before - ITEM.amount);

  await test.step("삭제", async () => {
    await page.getByRole("button", { name: new RegExp(ITEM.name) }).click();
    const dialog = page.getByRole("dialog", { name: "고정지출 수정" });
    await dialog.getByRole("button", { name: "항목 삭제" }).click();
    const confirm = page.getByRole("alertdialog", { name: `'${ITEM.name}' 항목을 삭제할까요?` });
    await confirm.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(toast(page, "삭제했습니다")).toBeVisible();
  });

  await expect(myAllowance(page)).toHaveText(formatWon(before));
  await expect(page.getByRole("button", { name: new RegExp(ITEM.name) })).toHaveCount(0);
});

test("공용통장 화면이 열린다", async ({ page }, testInfo) => {
  const seed = seedFor(testInfo.project.name);
  await loginAs(page, seed);
  await page.goto("/plan");
  await page.getByRole("navigation", { name: "월급 메뉴" }).getByRole("link", { name: "공용통장" }).click();
  await expect(page).toHaveURL(/\/joint$/);
  await expect(page.getByRole("heading", { level: 1, name: "공용통장" })).toBeVisible();
  await expect(page.getByText("공동저축").first()).toBeVisible();
});
