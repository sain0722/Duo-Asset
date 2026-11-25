/**
 * RLS·RPC 통합 테스트 도우미. 로컬 Supabase(`npx supabase start`)에 붙는다.
 * 키는 저장소에 두지 않고 실행 시 `supabase status` 에서 읽는다.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

interface LocalStack {
  url: string;
  publishableKey: string;
  serviceKey: string;
}

let stack: LocalStack | undefined;

function localStack(): LocalStack {
  if (stack) return stack;
  let output: string;
  try {
    output = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    throw new Error("로컬 Supabase 가 실행 중이 아닙니다. `npx supabase start` 후 다시 실행하세요.");
  }
  const env: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (match) env[match[1]] = match[2];
  }
  const url = env.API_URL;
  const publishableKey = env.PUBLISHABLE_KEY || env.ANON_KEY;
  const serviceKey = env.SERVICE_ROLE_KEY || env.SECRET_KEY;
  if (!url || !publishableKey || !serviceKey) {
    throw new Error("supabase status 출력에서 API_URL / 키를 찾지 못했습니다.");
  }
  stack = { url, publishableKey, serviceKey };
  return stack;
}

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };

/** RLS 를 우회하는 관리자 클라이언트 (테스트 준비·정리 전용) */
export function adminClient(): SupabaseClient {
  const { url, serviceKey } = localStack();
  return createClient(url, serviceKey, NO_SESSION);
}

/** 로그인하지 않은 클라이언트 */
export function anonClient(): SupabaseClient {
  const { url, publishableKey } = localStack();
  return createClient(url, publishableKey, NO_SESSION);
}

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

const PASSWORD = "test-password-1234";
const createdUserIds: string[] = [];

/** 관리자 API 로 사용자를 만들고(회원가입은 꺼져 있다) 로그인한 클라이언트를 돌려준다 */
export async function createUser(label: string, options: { confirmed?: boolean } = {}): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.com`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: options.confirmed ?? true,
  });
  if (error || !data.user) throw new Error(`사용자 생성 실패: ${error?.message}`);
  createdUserIds.push(data.user.id);

  const client = anonClient();
  if (options.confirmed ?? true) {
    const signIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (signIn.error) throw new Error(`로그인 실패: ${signIn.error.message}`);
  }
  return { id: data.user.id, email, client };
}

/** 가구를 만든다. 반환값은 household id */
export async function createHousehold(owner: TestUser, partnerEmail: string | null, startMonth = "2026-01"): Promise<string> {
  const { data, error } = await owner.client.rpc("create_household", {
    p_household_name: "테스트 가구",
    p_my_name: "본인",
    p_partner_name: "배우자",
    p_partner_email: partnerEmail,
    p_start_month: startMonth,
  });
  if (error) throw new Error(`가구 생성 실패: ${error.message}`);
  return data as string;
}

/** 테스트가 만든 사용자와 가구를 지운다 */
export async function cleanup(): Promise<void> {
  const admin = adminClient();
  if (createdUserIds.length === 0) return;
  const { data: members } = await admin.from("members").select("household_id").in("user_id", createdUserIds);
  const householdIds = [...new Set((members ?? []).map((m) => m.household_id as string))];
  if (householdIds.length > 0) await admin.from("households").delete().in("id", householdIds);
  for (const id of createdUserIds.splice(0)) await admin.auth.admin.deleteUser(id);
}

/** 단일 행을 읽는다 (없으면 예외) */
export async function one<T>(client: SupabaseClient, table: string, id: string): Promise<T> {
  const { data, error } = await client.from(table).select("*").eq("id", id).single();
  if (error) throw new Error(`${table} 조회 실패: ${error.message}`);
  return data as T;
}
