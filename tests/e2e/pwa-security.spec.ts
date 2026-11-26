import { expect, test, type Page } from "@playwright/test";

import { SCREENS, loginAs, openScreen, seedFor } from "./helpers";

/** 서비스 워커가 캐시해도 되는 것: 해시가 붙은 빌드 자산과 앱 아이콘뿐 (public/sw.js) */
const CACHEABLE = /^\/(_next\/static\/|icons\/|favicon\.ico$|icon\.svg$|apple-icon\.png$)/;

test.describe("PWA", () => {
  test("매니페스트 필드와 아이콘", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    const manifest = (await response.json()) as {
      name: string;
      short_name: string;
      display: string;
      start_url: string;
      lang: string;
      icons: { src: string; sizes: string; type: string; purpose?: string }[];
    };
    expect(manifest.name).toBe("DuoAsset");
    expect(manifest.short_name).toBe("DuoAsset");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.lang).toBe("ko");

    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((icon) => icon.purpose?.split(" ").includes("maskable") && icon.sizes === "512x512")).toBe(true);

    for (const icon of manifest.icons) {
      const image = await request.get(icon.src);
      expect(image.status(), icon.src).toBe(200);
      expect(image.headers()["content-type"], icon.src).toContain("image/png");
    }
  });

  test("서비스 워커가 활성화되고, 캐시에는 정적 자산과 아이콘만 남는다", async ({ page }, testInfo) => {
    const seed = seedFor(testInfo.project.name);
    await loginAs(page, seed);

    const state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return { scope: registration.scope, state: registration.active?.state, script: registration.active?.scriptURL };
    });
    expect(state.state).toBe("activated");
    expect(new URL(state.script!).pathname).toBe("/sw.js");
    expect(new URL(state.scope).pathname).toBe("/");
    // 페이지가 워커의 제어를 받을 때까지(clients.claim) 기다린다
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    // 금융 데이터가 오가는 화면을 두 번씩 다닌다 (두 번째는 캐시에서 읽힌다)
    for (let round = 0; round < 2; round++) {
      for (const screen of SCREENS) await openScreen(page, screen.path, screen.heading);
    }
    await page.goto("/assets");
    await page.locator("main").getByRole("link").filter({ hasText: "하늘 급여통장" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "하늘 급여통장" })).toBeVisible();

    const entries = await cacheEntries(page);
    expect(entries.length, "정적 자산이 하나도 캐시되지 않았다").toBeGreaterThan(0);
    expect(entries.some((url) => new URL(url).pathname.startsWith("/_next/static/"))).toBe(true);
    const origin = new URL(page.url()).origin;
    const unexpected = entries.filter((url) => {
      const parsed = new URL(url);
      return parsed.origin !== origin || !CACHEABLE.test(parsed.pathname) || parsed.searchParams.has("_rsc");
    });
    expect(unexpected, "HTML·RSC·Supabase 응답이 캐시에 있다").toEqual([]);
  });
});

test.describe("보안", () => {
  test("응답 헤더", async ({ page }, testInfo) => {
    const check = (headers: Record<string, string>, where: string) => {
      const csp = headers["content-security-policy"] ?? "";
      expect(csp, where).toContain("default-src 'self'");
      expect(csp, where).toContain("frame-ancestors 'none'");
      expect(csp, where).toContain("object-src 'none'");
      expect(csp, where).not.toContain("unsafe-eval");
      expect(headers["x-frame-options"], where).toBe("DENY");
      expect(headers["x-content-type-options"], where).toBe("nosniff");
      expect(headers["referrer-policy"], where).toBe("strict-origin-when-cross-origin");
    };

    const login = await page.goto("/login");
    check(login!.headers(), "/login");

    await loginAs(page, seedFor(testInfo.project.name));
    for (const path of ["/", "/settlement", "/assets"]) {
      const response = await page.goto(path);
      const headers = response!.headers();
      check(headers, path);
      // 로그인한 화면은 브라우저가 저장하지 않는다 (로그아웃 뒤 뒤로가기)
      expect(headers["cache-control"], path).toContain("no-store");
    }

    const manifest = await page.request.get("/manifest.webmanifest");
    check(manifest.headers(), "/manifest.webmanifest");
  });

  test("주요 화면을 다니는 동안 콘솔 오류·CSP 위반이 없다", async ({ page }, testInfo) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`console: ${message.text()} (${page.url()})`);
    });
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message} (${page.url()})`));
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        console.error(`CSP violation: ${event.violatedDirective} ${event.blockedURI}`);
      });
    });

    await page.goto("/login");
    await expect(page.getByRole("button", { name: "로그인" })).toBeEnabled();
    await loginAs(page, seedFor(testInfo.project.name));
    for (const screen of SCREENS) await openScreen(page, screen.path, screen.heading);

    // 클라이언트 이동(하단 탭·사이드바)과 상세 화면
    await page.goto("/assets");
    await page.locator("main").getByRole("link").filter({ hasText: "하늘 증권계좌" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "하늘 증권계좌" })).toBeVisible();
    await page.goto("/settlement?month=" + "2000-01");
    await expect(page.getByRole("heading", { level: 1, name: "월 정산" })).toBeVisible();

    expect(problems).toEqual([]);
  });
});

/** Cache Storage 에 저장된 모든 요청 URL */
function cacheEntries(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(request.url);
    }
    return urls;
  });
}
