import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 테스트: 프로덕션 빌드(`npm run build`)를 로컬 Supabase 에 붙여 실행한다.
 *   npx supabase start && npm run build && npm run test:e2e
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
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "off",
  },
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
