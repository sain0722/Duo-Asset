import { expect, test } from "@playwright/test";

import { currentPosition, latestMonth } from "@/lib/data/derive";
import { formatCompactWon, formatMonthOnly, formatWon } from "@/lib/format";

import { loadHousehold, loginAs, seedFor, statValue, toast } from "./helpers";

const ASSET = { name: "E2E 비상 현금", value: 470_000, edited: 520_000 };

test("자산을 추가하면 총자산이 그만큼 늘고, 상세 화면에서 값을 고칠 수 있다", async ({ page }, testInfo) => {
  const seed = seedFor(testInfo.project.name);
  const data = await loadHousehold(seed.ownerEmail, seed.password);
  const before = currentPosition(data).totals.assets;
  const monthLabel = formatMonthOnly(latestMonth(data)!.month);

  await loginAs(page, seed);
  await page.goto("/assets");
  await expect(page.getByRole("heading", { level: 1, name: "자산", exact: true })).toBeVisible();
  await expect(statValue(page, "총자산")).toHaveText(formatWon(before));

  await test.step("자산 추가 → 총자산 증가", async () => {
    await page.getByRole("button", { name: "자산 추가" }).first().click();
    const dialog = page.getByRole("dialog", { name: "자산 추가" });
    await dialog.getByLabel("이름").fill(ASSET.name);
    await expect(dialog.getByLabel("유형")).toHaveValue("cash");
    await dialog.getByLabel("현재 잔액").fill(String(ASSET.value));
    await dialog.getByRole("button", { name: "추가", exact: true }).click();
    await expect(toast(page, "자산을 추가했습니다")).toBeVisible();
    await expect(dialog).toBeHidden();

    await expect(statValue(page, "총자산")).toHaveText(formatWon(before + ASSET.value));
    const after = await loadHousehold(seed.ownerEmail, seed.password);
    expect(currentPosition(after).totals.assets).toBe(before + ASSET.value);
  });

  await test.step("상세 화면 → 값 수정", async () => {
    await page.getByRole("link", { name: new RegExp(ASSET.name) }).click();
    await expect(page).toHaveURL(/\/assets\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { level: 1, name: ASSET.name })).toBeVisible();
    await expect(statValue(page, "잔액")).toHaveText(formatWon(ASSET.value));

    await page.getByRole("button", { name: `${monthLabel} 값 수정` }).click();
    const dialog = page.getByRole("dialog", { name: `${ASSET.name} · ${monthLabel} 값` });
    await dialog.getByLabel("잔액", { exact: true }).fill(String(ASSET.edited));
    await dialog.getByRole("button", { name: "저장" }).click();
    await expect(toast(page, `${monthLabel} 값을 저장했습니다`)).toBeVisible();
    await expect(statValue(page, "잔액")).toHaveText(formatWon(ASSET.edited));

    await page.getByRole("link", { name: "자산" }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/assets$/);
    await expect(statValue(page, "총자산")).toHaveText(formatWon(before + ASSET.edited));
  });

  await test.step("정리: 자산 삭제 → 총자산이 돌아온다", async () => {
    await page.getByRole("link", { name: new RegExp(ASSET.name) }).click();
    await expect(page.getByRole("heading", { level: 1, name: ASSET.name })).toBeVisible();
    await page.getByRole("button", { name: "더 보기" }).click();
    await page.getByRole("menuitem", { name: "삭제" }).click();
    await page.getByRole("alertdialog", { name: "이 자산을 삭제할까요?" }).getByRole("button", { name: "삭제", exact: true }).click();
    await expect(toast(page, "자산을 삭제했습니다")).toBeVisible();
    await expect(page).toHaveURL(/\/assets$/);
    await expect(statValue(page, "총자산")).toHaveText(formatWon(before));
  });
});

test("부채 화면에서 상환 일정이 보인다", async ({ page }, testInfo) => {
  const seed = seedFor(testInfo.project.name);
  const data = await loadHousehold(seed.ownerEmail, seed.password);
  const carLoan = data.liabilities.find((liability) => liability.name === "자동차 할부")!;

  await loginAs(page, seed);
  await page.goto("/liabilities");
  await expect(page.getByRole("heading", { level: 1, name: "부채·고정지출" })).toBeVisible();
  await expect(statValue(page, "총부채")).toBeVisible();

  const item = page.getByRole("button", { name: /^자동차 할부/ });
  await expect(item).toHaveAttribute("aria-expanded", "false");
  await item.click();
  await expect(item).toHaveAttribute("aria-expanded", "true");

  await expect(page.getByRole("tab", { name: "상환 일정" })).toHaveAttribute("aria-selected", "true");
  const schedule = page.getByRole("tabpanel", { name: "상환 일정" }).getByRole("table");
  await expect(schedule.getByRole("columnheader", { name: "원금" })).toBeVisible();
  await expect(schedule.getByRole("columnheader", { name: "잔액" })).toBeVisible();
  // 무이자 할부: 매월 원금이 월 납부액과 같다
  const rows = schedule.locator("tbody tr");
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(rows.first().getByRole("cell").first()).toHaveText(formatCompactWon(carLoan.monthly_payment ?? 0));

  await page.getByRole("tab", { name: "예정 vs 실제" }).click();
  await expect(page.getByRole("tabpanel", { name: "예정 vs 실제" }).getByRole("table")).toBeVisible();
});
