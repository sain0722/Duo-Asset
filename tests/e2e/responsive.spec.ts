import { expect, test, type Page } from "@playwright/test";

import { SCREENS, expectNoHorizontalScroll, isMobile, loginAs, newDeviceContext, openScreen, seedFor } from "./helpers";

/** 모바일 하단 탭: 탭 이름 → 열리는 화면 */
const TABS = [
  { tab: "월급", path: "/plan", heading: "월급·배분" },
  { tab: "정산", path: "/settlement", heading: "월 정산" },
  { tab: "자산", path: "/assets", heading: "자산" },
  { tab: "목표", path: "/goals", heading: "목표" },
  { tab: "홈", path: "/", heading: "하늘·바다네" },
];

/** PC 사이드바: 모든 화면 + 설정 */
const SIDEBAR = [
  { label: "월급·배분", path: "/plan" },
  { label: "공용통장", path: "/joint" },
  { label: "월 정산", path: "/settlement" },
  { label: "자산", path: "/assets" },
  { label: "부채·고정지출", path: "/liabilities" },
  { label: "목표", path: "/goals" },
  { label: "미래 시뮬레이션", path: "/simulation" },
  { label: "설정", path: "/settings" },
  { label: "홈", path: "/" },
];

/** 주요 화면 + 펼친 상태가 넓어지기 쉬운 곳(상세, 이력, 부채 일정)에서 가로 스크롤이 없다 */
async function walkScreens(page: Page, where: string) {
  for (const screen of SCREENS) {
    await openScreen(page, screen.path, screen.heading);
    await expectNoHorizontalScroll(page, `${where} ${screen.path}`);
  }
  await page.goto("/assets");
  await page.locator("main").getByRole("link").filter({ hasText: "하늘 증권계좌" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "하늘 증권계좌" })).toBeVisible();
  await expectNoHorizontalScroll(page, `${where} 자산 상세`);

  await openScreen(page, "/liabilities", "부채·고정지출");
  await page.getByRole("button", { name: /^자동차 할부/ }).click();
  await expect(page.getByRole("tab", { name: "상환 일정" })).toBeVisible();
  await expectNoHorizontalScroll(page, `${where} 부채 일정`);

  await openScreen(page, "/settlement", "월 정산");
  const history = page.getByRole("button", { name: /^정산 이력/ }).filter({ visible: true });
  if ((await history.count()) > 0) await history.click();
  await expectNoHorizontalScroll(page, `${where} 정산`);
}

test("모든 주요 화면에서 가로 스크롤이 없다", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/login");
  await expectNoHorizontalScroll(page, "/login");
  await loginAs(page, seedFor(testInfo.project.name));
  await walkScreens(page, testInfo.project.name);

  if (isMobile(testInfo)) {
    // 가장 좁은 대상 폭(360px)에서도
    await page.setViewportSize({ width: 360, height: 740 });
    await walkScreens(page, "360px");
  }
});

test("모바일은 하단 탭, PC 는 사이드바로 이동한다", async ({ page }, testInfo) => {
  await loginAs(page, seedFor(testInfo.project.name));
  const mainNav = page.getByRole("navigation", { name: "주 메뉴" }).filter({ visible: true });
  await expect(mainNav).toHaveCount(1);

  if (isMobile(testInfo)) {
    await expect(page.locator("aside").filter({ has: page.getByRole("navigation", { name: "주 메뉴" }) })).toBeHidden();
    await expect(mainNav.getByRole("link")).toHaveCount(TABS.length);
    for (const { tab, path, heading } of TABS) {
      await mainNav.getByRole("link", { name: tab, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/" : path}$`));
      await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
      await expect(mainNav.getByRole("link", { name: tab, exact: true })).toHaveAttribute("aria-current", "page");
    }
    // 형제 화면(/joint)에서도 그룹 탭이 선택돼 있다
    await mainNav.getByRole("link", { name: "월급", exact: true }).click();
    await page.getByRole("navigation", { name: "월급 메뉴" }).getByRole("link", { name: "공용통장" }).click();
    await expect(page).toHaveURL(/\/joint$/);
    await expect(mainNav.getByRole("link", { name: "월급", exact: true })).toHaveAttribute("aria-current", "page");
    // 설정은 상단 바 아이콘
    await page.getByRole("link", { name: "설정" }).filter({ visible: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "설정" })).toBeVisible();
  } else {
    await expect(mainNav.getByRole("link")).toHaveCount(SIDEBAR.length - 1);
    const sidebar = page.locator("aside").filter({ has: mainNav });
    for (const { label, path } of SIDEBAR) {
      await sidebar.getByRole("link", { name: label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/" : path}$`));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(sidebar.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "page");
    }
    await expect(sidebar.getByText("하늘", { exact: true })).toBeVisible();
  }
});

test("다크 모드에서도 렌더링된다", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const seed = seedFor(testInfo.project.name);
  const background = async (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  const light = await newDeviceContext(browser, testInfo, { colorScheme: "light" });
  const lightPage = await light.newPage();
  await lightPage.goto("/login");
  const lightBackground = await background(lightPage);
  await light.close();

  const dark = await newDeviceContext(browser, testInfo, { colorScheme: "dark" });
  const page = await dark.newPage();
  await page.goto("/login");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  expect(await background(page)).not.toBe(lightBackground);

  await loginAs(page, seed);
  for (const screen of SCREENS) {
    await openScreen(page, screen.path, screen.heading);
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expectNoHorizontalScroll(page, `dark ${screen.path}`);
    // 본문 글자색과 배경색이 달라야 읽힌다
    const colors = await page.evaluate(() => {
      const heading = document.querySelector("h1")!;
      return { text: getComputedStyle(heading).color, body: getComputedStyle(document.body).backgroundColor };
    });
    expect(colors.text, screen.path).not.toBe(colors.body);
    expect(colors.body, screen.path).not.toBe(lightBackground);
  }
  await dark.close();
});
