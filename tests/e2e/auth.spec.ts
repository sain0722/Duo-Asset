import { expect, test } from "@playwright/test";

import { anonClient } from "../db/helpers";
import { login, loginAs, seedFor } from "./helpers";

const PROTECTED = ["/", "/plan", "/joint", "/settlement", "/assets", "/liabilities", "/goals", "/simulation", "/settings", "/onboarding"];

test.describe("인증", () => {
  test("로그인하지 않으면 보호 경로에서 /login 으로 보낸다", async ({ page }) => {
    for (const path of PROTECTED) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login$/);
      await expect(page.getByRole("button", { name: "로그인" })).toBeVisible();
    }
  });

  test("틀린 비밀번호는 한국어 오류를 보여 주고 로그인 화면에 머문다", async ({ page }, testInfo) => {
    const seed = seedFor(testInfo.project.name);
    await page.goto("/login");
    await page.getByLabel("이메일").fill(seed.ownerEmail);
    await page.getByLabel("비밀번호").fill("wrong-password-0000");
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("이메일 또는 비밀번호가 올바르지 않습니다.");
    await expect(page).toHaveURL(/\/login$/);

    // 빈 값은 서버에 보내지 않고 안내한다
    await page.getByLabel("비밀번호").fill("");
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("이메일과 비밀번호를 입력해 주세요.");
  });

  test("로그인하면 홈으로, 로그아웃하면 /login 으로 가고 뒤로가기로 보호 화면이 보이지 않는다", async ({ page, context }, testInfo) => {
    const seed = seedFor(testInfo.project.name);
    await loginAs(page, seed);
    // 로그인한 채 /login 에 오면 홈으로 보낸다
    await page.goto("/login");
    await expect(page).toHaveURL(/\/$/);

    // 금융 데이터가 있는 화면을 거친다
    await page.goto("/assets");
    await expect(page.getByRole("heading", { level: 1, name: "자산", exact: true })).toBeVisible();
    await expect(page.getByText("하늘 급여통장").first()).toBeVisible();

    // 로그인 중에도 세션·금융 데이터를 웹 스토리지에 두지 않는다 (세션은 쿠키)
    expect(await webStorage(page)).not.toMatch(/access_token|refresh_token|하늘 급여통장|하늘·바다네/);

    await page.goto("/settings");
    await page.getByRole("button", { name: "로그아웃" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "로그인" })).toBeVisible();

    // 뒤로가기: 다시 불러오면 proxy 가 로그인 화면으로 보낸다
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("하늘·바다네")).toHaveCount(0);
    await expect(page.getByText("하늘 급여통장")).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("하늘 급여통장")).toHaveCount(0);

    // 세션도 금융 데이터도 남지 않는다
    const storage = await webStorage(page);
    expect(storage).not.toMatch(/access_token|refresh_token|sb-|하늘|바다/);
    const cookies = await context.cookies();
    expect(cookies.filter((cookie) => cookie.name.startsWith("sb-") && cookie.value !== "")).toEqual([]);

    // 다시 보호 경로로 가도 로그인 화면이다
    await page.goto("/settlement");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("회원가입 경로가 없다", async ({ page }, testInfo) => {
    await page.goto("/login");
    await expect(page.getByText("계정은 관리자가 발급합니다.")).toBeVisible();
    await expect(page.getByRole("link", { name: /가입|sign ?up|register/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /가입|sign ?up|register/i })).toHaveCount(0);

    // 로그인 전: 가입 주소도 로그인 화면으로
    for (const path of ["/signup", "/register", "/join"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login$/);
    }

    // 로그인 후: 가입 화면은 없다
    const seed = seedFor(testInfo.project.name);
    await login(page, seed.ownerEmail, seed.password, /\/$/);
    const response = await page.goto("/signup");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("화면을 찾을 수 없습니다")).toBeVisible();

    // 인증 서버도 공개 가입을 받지 않는다
    const { data, error } = await anonClient().auth.signUp({ email: `signup-${Date.now()}@example.com`, password: "signup-test-1234" });
    expect(error, "공개 회원가입이 열려 있다").not.toBeNull();
    expect(data.user).toBeNull();
  });
});

/** localStorage + sessionStorage 의 모든 키와 값 */
function webStorage(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => {
    const dump = (storage: Storage) =>
      Array.from({ length: storage.length }, (_, i) => storage.key(i)!).map((key) => `${key}=${storage.getItem(key)}`);
    return JSON.stringify([...dump(localStorage), ...dump(sessionStorage)]);
  });
}
