import { expect, test, type Page } from "@playwright/test";

import type { SeedResult } from "../../scripts/seed-demo";
import { loadHousehold, loginAs, newDeviceContext, removeHousehold, seedOwnHousehold, toast } from "./helpers";

/** 두 사람이 같은 행을 고치는 스펙이라 전용 가구를 쓴다 */
let seed: SeedResult | undefined;

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000);
  seed = await seedOwnHousehold("share", testInfo);
});

test.afterAll(async () => {
  await removeHousehold(seed);
});

async function openAsset(page: Page, name: string) {
  await page.goto("/assets");
  await page.locator("main").getByRole("link", { name: new RegExp(`^${name}`) }).click();
  await expect(page).toHaveURL(/\/assets\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

async function openInfoEditor(page: Page) {
  await page.getByRole("button", { name: "더 보기" }).click();
  await page.getByRole("menuitem", { name: "정보 수정" }).click();
  const dialog = page.getByRole("dialog", { name: "자산 정보 수정" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("본인이 바꾼 값이 배우자 계정에 보인다", async ({ page, browser }, testInfo) => {
  const account = seed!;
  const memo = "E2E 공유 메모: 만기 전 해지하지 않기";
  await loginAs(page, account, "owner");
  await openAsset(page, "비상금 예금");
  const dialog = await openInfoEditor(page);
  await dialog.getByLabel(/^메모/).fill(memo);
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(toast(page, "저장했습니다")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.locator("main").getByText(memo)).toBeVisible();

  const context = await newDeviceContext(browser, testInfo);
  const partner = await context.newPage();
  await loginAs(partner, account, "partner");
  await openAsset(partner, "비상금 예금");
  await expect(partner.locator("main").getByText(memo)).toBeVisible();
  await context.close();
});

test("같은 행을 두 사람이 오래된 화면에서 고치면 나중 쪽에 충돌 안내가 뜨고 먼저 저장한 값이 남는다", async ({ page, browser }, testInfo) => {
  const account = seed!;
  const first = "먼저 저장한 메모";
  const second = "나중에 저장한 메모";

  const context = await newDeviceContext(browser, testInfo);
  const partner = await context.newPage();
  await loginAs(page, account, "owner");
  await loginAs(partner, account, "partner");

  // 두 사람이 같은 자산의 수정 창을 연다 (같은 version 을 읽었다)
  await openAsset(page, "공용통장");
  await openAsset(partner, "공용통장");
  const ownerDialog = await openInfoEditor(page);
  const partnerDialog = await openInfoEditor(partner);

  await ownerDialog.getByLabel(/^메모/).fill(first);
  await ownerDialog.getByRole("button", { name: "저장" }).click();
  await expect(toast(page, "저장했습니다")).toBeVisible();

  await partnerDialog.getByLabel(/^메모/).fill(second);
  await partnerDialog.getByRole("button", { name: "저장" }).click();
  await expect(toast(partner, "다른 기기에서 먼저 수정했습니다. 최신 내용을 다시 불러왔으니 확인 후 다시 시도해 주세요.")).toBeVisible();

  // 먼저 저장한 값이 유지되고, 나중 쪽 화면도 다시 읽은 값을 보여 준다
  const data = await loadHousehold(account.ownerEmail, account.password);
  expect(data.assets.find((asset) => asset.name === "공용통장")?.memo).toBe(first);
  await partnerDialog.getByRole("button", { name: "취소" }).click();
  await expect(partnerDialog).toBeHidden();
  await expect(partner.locator("main").getByText(first)).toBeVisible();
  await expect(partner.getByText(second)).toHaveCount(0);
  await context.close();
});
