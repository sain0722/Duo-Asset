import { describeError } from "./errors";
import { getQueryClient } from "./query-client";
import { getSupabase } from "./supabase";

export type SignInResult = { ok: true } | { ok: false; message: string };

interface AuthLikeError {
  name?: string;
  status?: number;
  code?: string;
}

/** Supabase Auth 로그인 오류를 사용자에게 보여 줄 문구로 바꾼다. */
export function signInErrorMessage(error: AuthLikeError): string {
  const status = error.status ?? 0;
  // 요청이 서버에 닿지 못했거나(오프라인 · DNS · CORS) 게이트웨이가 응답하지 못했다
  if (error.name === "AuthRetryableFetchError" || status >= 500) {
    return status >= 500
      ? "서버가 응답하지 않습니다. 잠시 후 다시 시도해 주세요."
      : "네트워크에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요.";
  }
  if (status === 429 || error.code === "over_request_rate_limit") {
    return "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.";
  }
  if (error.code === "email_not_confirmed") return "이메일 확인이 끝나지 않은 계정입니다. 관리자에게 문의해 주세요.";
  if (error.code === "user_banned") return "사용이 중지된 계정입니다. 관리자에게 문의해 주세요.";
  // 없는 계정인지 비밀번호가 틀렸는지는 알려 주지 않는다(서버도 구분해 주지 않는다).
  if (error.code === "invalid_credentials" || status === 400) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  return "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

/**
 * 전체 새로고침으로 이동한다. 로그인·로그아웃처럼 사용자가 바뀌는 순간에만 쓴다.
 * 문서를 새로 받으므로 proxy 가 세션을 다시 확인하고, 이전 사용자의 React 상태·쿼리 캐시·라우터 캐시가 남지 않는다.
 * (그 밖의 화면 이동은 <Link> 와 useRouter 를 쓴다.)
 */
export function reloadTo(path: "/" | "/login"): void {
  window.location.assign(path);
}

/** 이메일+비밀번호 로그인. 성공하면 세션이 쿠키에 저장된다. 이어서 reloadTo("/") 로 들어간다. */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  try {
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, message: signInErrorMessage(error) };
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describeError(error) };
  }
}

/** 서버에 세션 폐기를 알리는 요청을 기다리는 최대 시간. 이 기기의 세션은 요청 전에 이미 지워진다. */
const SIGN_OUT_TIMEOUT_MS = 3000;

let signingOut = false;
let leaving = false;

/**
 * 로그아웃. 쿼리 캐시를 비우고 → 세션을 지우고 → 전체 새로고침으로 /login 에 간다.
 * 전체 새로고침이라 메모리에 있던 금융 데이터(React 상태 포함)가 모두 사라진다.
 *
 * 이 기기의 세션만 끝낸다(scope: local). 배우자나 내 다른 기기의 로그인은 그대로다.
 * 오프라인이어도 이 기기에서는 로그아웃된다.
 */
export async function signOut(): Promise<void> {
  signingOut = true;
  getQueryClient().clear();
  try {
    await Promise.race([
      getSupabase().auth.signOut({ scope: "local" }),
      new Promise((resolve) => setTimeout(resolve, SIGN_OUT_TIMEOUT_MS)),
    ]);
  } catch {
    // 세션 쿠키는 요청 전에 지워졌다. 서버 쪽 폐기만 실패한 것이므로 그대로 나간다.
  }
  leaveToLogin();
}

/** 메모리의 금융 데이터를 버리고 로그인 화면으로 간다(전체 새로고침). */
function leaveToLogin(): void {
  if (leaving || window.location.pathname === "/login") return;
  leaving = true;
  hideScreen();
  getQueryClient().clear();
  reloadTo("/login");
}

/** 떠나는 화면을 가린다. 브라우저가 이 문서를 뒤로가기 캐시(bfcache)에 보관해도 금융 정보가 보이지 않는다. */
function hideScreen(): void {
  document.body.style.visibility = "hidden";
}

/** 세션이 없으면(만료 · 쿠키 삭제) 로그인 화면으로 보낸다. 데이터 조회가 실패했을 때 확인한다. */
export async function leaveIfSignedOut(): Promise<void> {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session) leaveToLogin();
}

/**
 * 로그인 상태 감시. 앱 전체에서 한 번만 건다(app/providers.tsx).
 *  - 다른 탭에서 로그아웃했거나 세션이 만료·폐기되면 이 탭도 데이터를 버리고 /login 으로 간다.
 *  - 뒤로가기 캐시(bfcache)에서 되살아난 화면은 로그인 상태가 그대로라는 보장이 없으므로 새로 불러온다
 *    (로그아웃 후 뒤로가기로 이전 화면이 보이지 않게 한다. 새로 불러오면 proxy 가 다시 판단한다).
 */
export function watchAuth(): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((event) => {
    // 이 탭에서 누른 로그아웃은 signOut() 이 서버 요청을 마친 뒤 직접 이동한다.
    if (event === "SIGNED_OUT" && !signingOut) leaveToLogin();
  });

  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) window.location.reload();
  };
  window.addEventListener("pageshow", onPageShow);

  return () => {
    data.subscription.unsubscribe();
    window.removeEventListener("pageshow", onPageShow);
  };
}
