import { expect, test, type Page } from "@playwright/test";

import { basisText, currentPosition, findMonth, latestMonth, positionView, reportFor } from "@/lib/data/derive";
import { JOINT } from "@/lib/finance/types";
import { formatCompactWon, formatMonthOnly, formatWon, formatYm } from "@/lib/format";
import { addMonths, currentYm } from "@/lib/month";

import type { SeedResult } from "../../scripts/seed-demo";
import { adminClient } from "../db/helpers";
import { isMobile, loadHousehold, loginAs, removeHousehold, seedOwnHousehold, statValue, toast } from "./helpers";

/** 자산·부채·이동을 추가하고 자산을 보관하므로 이 스펙 전용 가구를 쓴다 */
let seed: SeedResult | undefined;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  seed = await seedOwnHousehold("assets", testInfo);
});

test.afterAll(async () => {
  await removeHousehold(seed);
});

const THIS_MONTH = currentYm();
const WORKING = addMonths(THIS_MONTH, -1);
const load = () => loadHousehold(seed!.ownerEmail, seed!.password);

async function openAssets(page: Page) {
  await page.goto("/assets");
  await expect(page.getByRole("heading", { level: 1, name: "자산", exact: true })).toBeVisible();
}

async function openLiabilities(page: Page) {
  await page.goto("/liabilities");
  await expect(page.getByRole("heading", { level: 1, name: "부채·고정지출" })).toBeVisible();
}

const ASSET = { name: "E2E 비상 현금", value: 470_000, edited: 520_000 };

test("자산을 추가하면 총자산이 그만큼 늘고, 상세 화면에서 값을 고칠 수 있다", async ({ page }) => {
  const data = await load();
  const before = currentPosition(data).totals.assets;
  const view = positionView(data)!;
  const monthLabel = formatMonthOnly(latestMonth(data)!.month);

  await loginAs(page, seed!);
  await openAssets(page);
  const total = page.locator('[data-slot="stat"]').filter({ has: page.locator("span", { hasText: /^총자산$/ }) });
  await expect(statValue(page, "총자산")).toHaveText(formatWon(before));
  // 값의 기준 시점과 비교 대상 (예: "10월 진행 중 · 일부 잔액은 전월 값", "9월 말보다 ▲…")
  await expect(total).toContainText(basisText(view.basis));
  expect(view.change).not.toBeNull();
  await expect(total).toContainText(`${formatMonthOnly(view.change!.since)} 말보다`);

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
    const after = await load();
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

test("부채를 추가하면 총부채가 늘고, 이번 달에 갚은 원금은 상환으로 잡힌다", async ({ page }) => {
  const LOAN = { name: "E2E 가전 할부", original: 2_400_000, balance: 1_800_000, term: 24, monthly: 100_000 };
  const data = await load();
  const before = currentPosition(data).totals;

  await loginAs(page, seed!);
  await openLiabilities(page);
  await expect(statValue(page, "총부채")).toHaveText(formatWon(before.liabilities));

  await page.getByRole("button", { name: "부채 추가" }).first().click();
  const dialog = page.getByRole("dialog", { name: "부채 추가" });
  await dialog.getByLabel("이름").fill(LOAN.name);
  await expect(dialog.getByLabel("상환 방식")).toHaveValue("installment");
  await dialog.getByLabel("최초 원금").fill(String(LOAN.original));
  await dialog.getByLabel("현재 남은 원금").fill(String(LOAN.balance));
  await dialog.getByLabel("기간").fill(String(LOAN.term));
  await dialog.getByLabel("첫 납부 월").fill(addMonths(WORKING, -5));
  // 전부터 있던 부채: 그 달에 갚은 원금(예정 = 최초 원금 ÷ 기간)을 미리 채워 둔다
  const repaid = dialog.getByLabel(`${formatMonthOnly(WORKING)}에 갚은 원금`);
  await expect(repaid).toHaveValue(LOAN.monthly.toLocaleString("ko-KR"));
  await dialog.getByRole("button", { name: "추가", exact: true }).click();
  await expect(toast(page, "부채를 추가했습니다")).toBeVisible();
  await expect(dialog).toBeHidden();

  await expect(statValue(page, "총부채")).toHaveText(formatWon(before.liabilities + LOAN.balance));
  await expect(page.getByRole("button", { name: new RegExp(`^${LOAN.name}`) })).toContainText(formatWon(LOAN.balance));

  const after = await load();
  expect(currentPosition(after).totals.liabilities).toBe(before.liabilities + LOAN.balance);
  expect(currentPosition(after).totals.netWorth).toBe(before.netWorth - LOAN.balance);
  const line = reportFor(after, findMonth(after, WORKING)!).liabilityLines.find((candidate) => candidate.name === LOAN.name)!;
  expect(line).toMatchObject({ openBalance: LOAN.balance + LOAN.monthly, balance: LOAN.balance });

  // 홈의 순자산에도 반영된다
  await page.goto("/");
  await expect(statValue(page, "순자산")).toHaveText(formatWon(before.netWorth - LOAN.balance));
});

test("부채 화면에서 상환 일정과 완납 시점이 보인다", async ({ page }) => {
  const data = await load();
  const carLoan = data.liabilities.find((liability) => liability.name === "자동차 할부")!;

  await loginAs(page, seed!);
  await openLiabilities(page);
  await expect(statValue(page, "총부채")).toBeVisible();

  const item = page.getByRole("button", { name: /^자동차 할부/ });
  // 시드: 기준 월 잔액 2,000만 원에서 5달 동안 50만 원씩 갚아 1,750만 원 → 남은 35회 납부는 정산 중인 달부터
  await expect(item).toContainText(`${formatYm(addMonths(WORKING, 34))} 완납`);
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

test("주머니 사이 이동은 총자산·총소비를 바꾸지 않고 주머니별 소비만 옮긴다", async ({ page }, testInfo) => {
  const AMOUNT = 300_000;
  const data = await load();
  const before = reportFor(data, findMonth(data, WORKING)!);
  const [haneul, bada] = data.members;
  const pocket = (report: typeof before, id: string) => report.pockets.find((candidate) => candidate.pocket === id)!.consumption;

  await loginAs(page, seed!);
  await page.goto("/settlement");
  await expect(page.getByText(`${formatMonthOnly(WORKING)} 정산 진행`)).toBeVisible();
  const section = page.locator("#section-transfers");
  if (isMobile(testInfo)) {
    const header = section.locator("> button[aria-expanded]");
    if ((await header.getAttribute("aria-expanded")) === "false") await header.click();
  }
  await section.getByRole("button", { name: "이동 추가" }).click();
  const dialog = page.getByRole("dialog", { name: "이동 추가" });
  await expect(dialog.getByRole("radiogroup", { name: "보낸 주머니" }).getByRole("radio", { name: haneul.name })).toBeChecked();
  await dialog.getByRole("radiogroup", { name: "받은 주머니" }).getByRole("radio", { name: bada.name }).click();
  await dialog.getByLabel("금액").fill(String(AMOUNT));
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(dialog).toBeHidden();
  await expect(section.getByRole("button", { name: new RegExp(`${haneul.name}.*${bada.name}`) })).toContainText(formatWon(AMOUNT));

  const after = reportFor(await load(), findMonth(await load(), WORKING)!);
  expect(after.transferLines).toHaveLength(before.transferLines.length + 1);
  expect(after.closing.assets).toBe(before.closing.assets);
  expect(after.consumption).toBe(before.consumption);
  expect(after.income).toBe(before.income);
  expect(pocket(after, haneul.id)).toBe(pocket(before, haneul.id) - AMOUNT);
  expect(pocket(after, bada.id)).toBe(pocket(before, bada.id) + AMOUNT);
  expect(pocket(after, JOINT)).toBe(pocket(before, JOINT));

  await openAssets(page);
  await expect(statValue(page, "총자산")).toHaveText(formatWon(before.closing.assets));
});

test("잔액이 남은 채 보관한 자산도 총자산에 들어간다", async ({ page }) => {
  const data = await load();
  const position = currentPosition(data);
  const gye = data.assets.find((asset) => asset.name === "계 모임")!;
  const value = position.assetValues[gye.id];
  expect(value).toBeGreaterThan(0);

  // 화면에서는 0원이 된 자산만 보관할 수 있으므로, 예전 버전에서 보관한 자산 같은 상태를 DB 에 직접 만든다
  const { error } = await adminClient().from("assets").update({ is_active: false }).eq("id", gye.id);
  expect(error).toBeNull();
  const archived = await load();
  expect(archived.assets.find((asset) => asset.id === gye.id)!.is_active).toBe(false);
  expect(currentPosition(archived).totals.assets).toBe(position.totals.assets);

  await loginAs(page, seed!);
  await openAssets(page);
  await expect(statValue(page, "총자산")).toHaveText(formatWon(position.totals.assets));
  const list = page.locator('[data-slot="card"]').filter({ has: page.getByText("자산 목록", { exact: true }) });
  await expect(list.getByRole("link", { name: /^계 모임/ })).toHaveCount(0);
  await list.getByRole("button", { name: "보관한 자산 1개" }).click();
  await expect(list.getByRole("link", { name: /^계 모임/ })).toContainText(formatWon(value));

  await page.goto("/");
  await expect(statValue(page, "순자산")).toHaveText(formatWon(position.totals.netWorth));
});
