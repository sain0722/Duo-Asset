import type { Metadata } from "next";

import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "환경 설정" };

const code = "rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.8125rem] break-all";

/**
 * 환경변수(NEXT_PUBLIC_SUPABASE_URL · NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)가 없을 때의 안내.
 * proxy 가 모든 요청을 여기로 보낸다. 설정이 끝나면 이 화면은 열리지 않는다.
 */
export default function SetupPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 pt-safe-10 pb-safe-10">
      <div className="flex w-full max-w-md flex-col">
        <Logo />
        <h1 className="mt-8 text-[1.375rem] leading-tight font-bold tracking-tight">환경 설정이 필요합니다</h1>
        <p className="mt-2 text-body text-muted-foreground">
          Supabase 연결 정보가 없어 앱을 시작할 수 없습니다. 아래 순서로 설정해 주세요.
        </p>

        <ol className="mt-6 flex list-decimal flex-col gap-4 rounded-2xl border bg-card py-5 pr-5 pl-9 text-body sm:py-6 sm:pr-6 sm:pl-10">
          <li>
            <code className={code}>.env.example</code> 을 <code className={code}>.env.local</code> 로 복사합니다.
          </li>
          <li>
            Supabase 대시보드의 프로젝트 설정 → API 에서 두 값을 복사해 넣습니다.
            <ul className="mt-2 flex flex-col gap-1.5">
              <li>
                <code className={code}>NEXT_PUBLIC_SUPABASE_URL</code>
              </li>
              <li>
                <code className={code}>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>
              </li>
            </ul>
          </li>
          <li>
            개발 서버를 다시 시작합니다. 배포 환경(Vercel)에서는 프로젝트 환경변수에 같은 값을 넣고 다시 배포합니다.
          </li>
        </ol>

        <p className="mt-4 text-caption text-muted-foreground">
          두 값은 브라우저에 공개돼도 되는 값입니다. <code className={code}>service_role</code> 이나{" "}
          <code className={code}>sb_secret_</code> 키는 넣지 않습니다.
        </p>
      </div>
    </main>
  );
}
