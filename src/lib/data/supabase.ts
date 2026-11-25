import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** 환경변수가 설정됐는가. 없으면 앱은 설정 안내 화면만 보여 준다. */
export const isSupabaseConfigured = SUPABASE_URL !== "" && SUPABASE_KEY !== "";

let client: SupabaseClient | undefined;

/** 브라우저용 Supabase 클라이언트 (싱글턴). 세션은 쿠키에 저장되어 proxy 가 서버에서 검증한다. */
export function getSupabase(): SupabaseClient {
  if (!client) client = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}
