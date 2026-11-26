import { expect, test } from "@playwright/test";

import { formatMonthOnly } from "@/lib/format";
import { addMonths, currentYm } from "@/lib/month";

import { createAccount, loadHousehold, login, newDeviceContext, removeAccounts, toast, type TestAccount } from "./helpers";

test.describe("온보딩", () => {
  const accounts: TestAccount[] = [];

  test.afterAll(async () => {
    await removeAccounts(accounts.splice(0));
  });

  test("가구 없는 계정은 가구를 만들고, 초대받은 배우자는 로그인하면 자동으로 연결된다", async ({ page, browser }) => {
    const owner = await createAccount("e2e-onboard-owner");
    const partner = await createAccount("e2e-onboard-partner");
    accounts.push(owner, partner);

    await test.step("가구가 없으면 /onboarding 으로 간다", async () => {
      await login(page, owner.email, owner.password);
      await expect(page).toHaveURL(/\/onboarding$/);
      await expect(page.getByRole("heading", { level: 1, name: /가구를\s*만들어 볼까요/ })).toBeVisible();
    });

    await test.step("기준 월의 기본값은 지난달이다", async () => {
      const lastMonth = addMonths(currentYm(), -1);
      await expect(page.getByRole("radio", { name: `${formatMonthOnly(lastMonth)} · 지난달` })).toBeChecked();
      await expect(page.getByRole("radio", { name: `${formatMonthOnly(currentYm())} · 이번 달` })).not.toBeChecked();
    });

    await test.step("빈 칸은 한국어로 안내한다", async () => {
      await page.getByRole("button", { name: "가구 만들기" }).click();
      await expect(page.getByText("가구 이름을 입력해 주세요.")).toBeVisible();
      await expect(page.getByText("내 이름을 입력해 주세요.")).toBeVisible();
    });

    await test.step("가구를 만들면 홈의 시작하기 안내가 보인다", async () => {
      await page.getByLabel("가구 이름").fill("가람·누리네");
      await page.getByLabel("내 이름").fill("가람");
      await page.getByLabel("배우자 이름").fill("누리");
      await expect(page.getByText("배우자 계정은 관리자가 따로 발급해야 합니다.", { exact: false })).toBeVisible();
      await page.getByLabel(/^배우자 로그인 이메일/).fill(partner.email);
      await page.getByRole("button", { name: "가구 만들기" }).click();

      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { level: 1, name: "가람·누리네" })).toBeVisible();
      await expect(page.getByText("시작하기", { exact: true })).toBeVisible();
      const steps = page.getByRole("list", { name: /^시작하기 4단계 중 0단계 완료$/ });
      await expect(steps).toBeVisible();
      for (const step of ["자산 등록", "부채 등록", "월급·배분 설정", "기준 월 마감"]) {
        await expect(steps.getByText(step, { exact: true })).toBeVisible();
      }
    });

    await test.step("초대받은 배우자는 로그인하면 같은 가구에 연결된다", async () => {
      const context = await newDeviceContext(browser, test.info());
      const partnerPage = await context.newPage();
      await login(partnerPage, partner.email, partner.password);
      await expect(partnerPage.getByRole("heading", { level: 1, name: "가람·누리네" })).toBeVisible();
      await expect(partnerPage).toHaveURL(/\/$/);
      await expect(toast(partnerPage, "가람님 가구에 연결되었습니다")).toBeVisible();
      await context.close();
    });

    await test.step("두 계정이 같은 가구를 보고, 기준 월은 지난달이다", async () => {
      const mine = await loadHousehold(owner.email, owner.password);
      const theirs = await loadHousehold(partner.email, partner.password);
      expect(theirs.household.id).toBe(mine.household.id);
      expect(mine.members.map((member) => member.name)).toEqual(["가람", "누리"]);
      expect(theirs.me.name).toBe("누리");
      expect(mine.months.map((month) => month.month)).toEqual([addMonths(currentYm(), -1)]);
    });
  });
});
