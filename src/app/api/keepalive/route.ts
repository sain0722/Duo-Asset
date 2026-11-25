import { isSupabaseConfigured } from "@/lib/data/supabase";
import { pingDatabase } from "@/lib/data/supabase-server";

/**
 * Supabase 무료 플랜은 7일간 활동이 거의 없으면 프로젝트를 일시중지한다.
 * Vercel Cron(vercel.json)이 하루에 한 번 이 주소를 호출해 DB 에 가벼운 요청(ping RPC)을 보낸다.
 *
 * CRON_SECRET 환경변수가 있으면 `Authorization: Bearer <CRON_SECRET>` 요청만 받는다.
 * (Vercel 은 프로젝트에 CRON_SECRET 이 있으면 크론 호출에 이 헤더를 자동으로 붙인다.)
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!isSupabaseConfigured) return json({ ok: false, error: "not_configured" }, 503);

  const ok = await pingDatabase();
  return ok ? json({ ok: true }, 200) : json({ ok: false, error: "ping_failed" }, 502);
}

function json(body: { ok: boolean; error?: string }, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
