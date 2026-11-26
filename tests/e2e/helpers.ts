/**
 * E2E 공통 도우미.
 * - 브라우저 조작: 로그인, 화면 이동, 지표 읽기, 가로 스크롤 검사
 * - Node 쪽 기대값: 같은 계정으로 supabase-js 에 로그인해 앱과 같은 lib 계산(reportFor 등)을 돌린다
 * - 테스트 데이터: 가상 가구(seedDemo)와 가구 없는 계정을 만들고 지운다
 */
import { expect, type Browser, type BrowserContext, type BrowserContextOptions, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

import { fetchHousehold } from "@/lib/data/queries";
import { setSupabaseClient } from "@/lib/data/supabase";
import type { HouseholdData } from "@/lib/data/types";

import { seedDemo, type SeedResult } from "../../scripts/seed-demo";
import { adminClient, anonClient } from "../db/helpers";
import { seedFor } from "./seed";

export { seedFor };

export const isMobile = (testInfo: TestInfo) => testInfo.project.name === "mobile";

// ───────────────────────── 로그인 ─────────────────────────

/** 로그인 화면에서 이메일·비밀번호로 로그인한다. 홈(또는 온보딩)으로 넘어갈 때까지 기다린다. */
export async function login(page: Page, email: string, password: string, landing: RegExp = /\/(onboarding)?$/) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  const submit = page.getByRole("button", { name: "로그인" });
  // 하이드레이션 전에는 버튼이 비활성이다
  await expect(submit).toBeEnabled();
  await submit.click();
  await page.waitForURL(landing);
}

/** 시드 가구의 본인 계정으로 로그인하고 홈이 그려질 때까지 기다린다 */
export async function loginAs(page: Page, seed: SeedResult, who: "owner" | "partner" = "owner") {
  await login(page, who === "owner" ? seed.ownerEmail : seed.partnerEmail, seed.password, /\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "하늘·바다네" })).toBeVisible();
}

// ───────────────────────── 화면 ─────────────────────────

/** 주요 화면 (경로와 h1 제목) */
export const SCREENS = [
  { path: "/", heading: "하늘·바다네" },
  { path: "/plan", heading: "월급·배분" },
  { path: "/joint", heading: "공용통장" },
  { path: "/settlement", heading: "월 정산" },
  { path: "/assets", heading: "자산" },
  { path: "/liabilities", heading: "부채·고정지출" },
  { path: "/goals", heading: "목표" },
  { path: "/simulation", heading: "미래 시뮬레이션" },
  { path: "/settings", heading: "설정" },
] as const;

/** 경로로 이동하고 h1 이 보일 때까지 기다린다 (가구 데이터를 받아 본문이 그려졌다는 뜻) */
export async function openScreen(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
}

/** 가로 스크롤이 없다 */
export async function expectNoHorizontalScroll(page: Page, where: string) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `${where}: scrollWidth ${scrollWidth} > innerWidth ${innerWidth}`).toBeLessThanOrEqual(innerWidth);
}

/** Stat(라벨 + 큰 값)의 금액 */
export function statValue(scope: Page | Locator, label: string): Locator {
  const page = "page" in scope ? scope.page() : scope;
  return scope
    .locator('[data-slot="stat"]')
    .filter({ has: page.locator("span", { hasText: new RegExp(`^${escapeRegExp(label)}$`) }) })
    .locator('[data-slot="money"]')
    .first();
}

/** <dt>라벨</dt><dd>값</dd> 의 값 */
export function definitionValue(scope: Page | Locator, label: string): Locator {
  return scope
    .locator("dt")
    .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`) })
    .locator("xpath=following-sibling::dd[1]");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** sonner 토스트 */
export function toast(page: Page, text: string | RegExp): Locator {
  return page.locator("[data-sonner-toast]").filter({ hasText: text });
}

// ───────────────────────── Node 쪽 기대값 ─────────────────────────

async function signedIn(email: string, password: string): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`로그인 실패 (${email}): ${error.message}`);
  return client;
}

/**
 * 화면과 같은 계정으로 가구 데이터를 읽는다 (tests/db/data-layer.test.ts 의 loadAs 방식).
 * 기대값은 이 데이터에 앱과 같은 lib 함수(reportFor, currentPosition …)를 적용해 구한다.
 */
export async function loadHousehold(email: string, password: string): Promise<HouseholdData> {
  const client = await signedIn(email, password);
  setSupabaseClient(client);
  try {
    const data = await fetchHousehold();
    if (!data) throw new Error(`가구 없음 (${email})`);
    return data;
  } finally {
    setSupabaseClient(undefined);
    await client.auth.signOut({ scope: "local" });
  }
}

// ───────────────────────── 테스트 데이터 ─────────────────────────

/** 이 스펙 전용 가상 가구 (데이터를 크게 바꾸는 스펙이 다른 스펙에 영향을 주지 않게) */
export async function seedOwnHousehold(label: string, testInfo: TestInfo): Promise<SeedResult> {
  const project = testInfo.project.name.slice(0, 1);
  return seedDemo({ suffix: `e2e-${label}-${project}-${Date.now().toString(36)}`, quiet: true });
}

/** 가구와 두 계정을 지운다 */
export async function removeHousehold(seed: SeedResult | undefined) {
  if (!seed) return;
  const admin = adminClient();
  const { data: members } = await admin.from("members").select("user_id").eq("household_id", seed.householdId);
  await admin.from("households").delete().eq("id", seed.householdId);
  const userIds = new Set((members ?? []).map((member) => member.user_id as string | null).filter(Boolean));
  // 아직 초대만 된(연결 전) 배우자 계정도 지운다
  for (const email of [seed.ownerEmail, seed.partnerEmail]) {
    const id = await userIdByEmail(email);
    if (id) userIds.add(id);
  }
  for (const id of userIds) await admin.auth.admin.deleteUser(id!);
}

export interface TestAccount {
  id: string;
  email: string;
  password: string;
}

/** 가구 없는 계정 (관리자 API 로 만든다. 공개 회원가입은 꺼져 있다) */
export async function createAccount(label: string): Promise<TestAccount> {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.com`;
  const password = `e2e-${randomUUID()}`;
  const { data, error } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`계정 생성 실패: ${error?.message}`);
  return { id: data.user.id, email, password };
}

/** 계정과, 그 계정이 속한 가구를 지운다 */
export async function removeAccounts(accounts: TestAccount[]) {
  const admin = adminClient();
  const ids = accounts.map((account) => account.id);
  if (ids.length === 0) return;
  const { data: members } = await admin.from("members").select("household_id").in("user_id", ids);
  const householdIds = [...new Set((members ?? []).map((member) => member.household_id as string))];
  if (householdIds.length > 0) await admin.from("households").delete().in("id", householdIds);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
}

async function userIdByEmail(email: string): Promise<string | null> {
  const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((user) => user.email === email)?.id ?? null;
}

/** 같은 프로젝트 설정(기기·뷰포트·로캘)으로 별도 브라우저 컨텍스트를 연다 (다른 사람의 기기) */
export async function newDeviceContext(browser: Browser, testInfo: TestInfo, options: BrowserContextOptions = {}): Promise<BrowserContext> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { defaultBrowserType, ...use } = testInfo.project.use as typeof testInfo.project.use & { defaultBrowserType?: string };
  return browser.newContext({ ...(use as BrowserContextOptions), ...options });
}
