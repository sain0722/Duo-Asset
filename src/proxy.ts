import { NextResponse, type NextRequest } from "next/server";

import { isSupabaseConfigured } from "@/lib/data/supabase";
import { carryCookies, checkSession } from "@/lib/data/supabase-server";

/**
 * 모든 페이지 요청 앞에서 실행된다(구 middleware).
 *  1. 세션 쿠키를 검증하고 만료가 가까우면 갱신한다.
 *  2. 로그인하지 않은 요청은 /login 으로, 로그인한 채 /login 에 오면 / 로 보낸다.
 *
 * 여기는 1차 차단이다. 페이지(HTML)에는 금융 데이터가 없고, 데이터 접근 권한은 DB 의 RLS 가 최종 판단한다.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 개발 서버에서만: 디자인 킷(/dev/kit)은 로그인 없이 연다. 운영 빌드에서는 로그인 뒤에도 404 다.
  if (process.env.NODE_ENV === "development" && pathname.startsWith("/dev/")) return NextResponse.next();

  // 환경변수가 없으면 어떤 화면도 동작할 수 없다. 설정 안내만 보여 준다.
  if (!isSupabaseConfigured) {
    return pathname === "/setup" ? NextResponse.next() : redirectTo(request, "/setup");
  }
  if (pathname === "/setup") return redirectTo(request, "/");

  const { response, userId } = await checkSession(request);
  const isLogin = pathname === "/login";

  // 리다이렉트할 때도 갱신(또는 삭제)된 세션 쿠키를 함께 보낸다.
  if (!userId && !isLogin) return carryCookies(response, redirectTo(request, "/login"));
  if (userId && isLogin) return carryCookies(response, redirectTo(request, "/"));

  // 로그인 여부에 따라 달라지는 응답이다. 브라우저가 보관했다가 로그아웃 뒤 "뒤로가기"로 다시 보여 주지 않게 한다.
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * 아래를 뺀 모든 경로에서 실행한다. 여기에 없는 경로는 전부 로그인이 필요하다.
     *  - _next/static, _next/image   빌드된 정적 자산(JS · CSS · 폰트)
     *  - icons/, favicon.ico, icon.svg, apple-icon.png   앱 아이콘
     *  - manifest.webmanifest, sw.js   PWA (로그인 화면에서도 필요하다)
     *  - api/keepalive   크론 호출 (CRON_SECRET 으로 따로 보호)
     */
    "/((?!_next/static/|_next/image|icons/|favicon\\.ico$|icon\\.svg$|apple-icon\\.png$|manifest\\.webmanifest$|sw\\.js$|api/keepalive$).*)",
  ],
};
