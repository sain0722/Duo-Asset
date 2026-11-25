import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "./supabase";

/**
 * 서버(proxy · 라우트 핸들러) 전용 Supabase 접근.
 * 금융 데이터는 서버에서 읽지 않는다 — 여기서는 세션 확인과 keepalive 만 한다.
 */

export interface SessionCheck {
  /** 그대로 통과시킬 응답. 세션을 갱신했다면 새 쿠키가 실려 있다. */
  response: NextResponse;
  /** 서명과 만료를 검증한 사용자 id. 로그인하지 않았으면 null. */
  userId: string | null;
}

/**
 * 요청의 세션 쿠키를 검증하고, 만료가 가까우면 갱신해 응답 쿠키에 싣는다.
 *
 * `getSession()` 은 쿠키 내용을 그대로 믿으므로 쓰지 않는다. `getClaims()` 는 액세스 토큰의 서명을
 * 프로젝트 공개키(JWKS)로 검증하고(대칭키 프로젝트라면 Auth 서버에 물어본다), 만료됐으면 먼저 갱신한다.
 */
export async function checkSession(request: NextRequest): Promise<SessionCheck> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies, headers) {
        // 갱신된 토큰을 이 요청의 뒤쪽(렌더링)과 브라우저 양쪽에 전달한다.
        for (const { name, value } of cookies) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
        // 토큰이 실린 응답을 CDN 이 캐시하지 못하게 하는 헤더(Cache-Control: private, no-store …)
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();
  const userId = !error && typeof data?.claims.sub === "string" ? data.claims.sub : null;
  return { response, userId };
}

/** `from` 에 실린 세션 쿠키(갱신·삭제)를 다른 응답(리다이렉트)으로 옮긴다. */
export function carryCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  return to;
}

/** DB 에 가벼운 호출을 한 번 보낸다(keepalive). publishable 키만 쓰고 세션은 없다. */
export async function pingDatabase(): Promise<boolean> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.rpc("ping");
  return !error;
}
