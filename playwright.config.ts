import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 테스트: 프로덕션 빌드를 로컬 Supabase 에 붙여 실행한다.
 *   npx supabase start && npm run test:e2e
 * 빌드는 .next-e2e 폴더에 따로 만들기 때문에 개발 서버를 띄운 채로도 실행할 수 있다.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // 프로젝트마다 따로 시드한 가구를 쓰지만, 한 가구 안에서는 테스트가 순서대로 데이터를 바꾼다
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "off",
  },
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    env: { NEXT_DIST_DIR: ".next-e2e" },
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
