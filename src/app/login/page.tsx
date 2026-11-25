import type { Metadata } from "next";

import { Logo } from "@/components/logo";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인" };

/** 로그인. 공개 회원가입은 없다 — 계정은 Supabase 대시보드에서 관리자가 만든다. */
export default function LoginPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 pt-safe-10 pb-safe-10">
      <div className="flex w-full max-w-sm flex-col">
        <Logo size="lg" />
        <h1 className="mt-8 text-[1.625rem] leading-snug font-bold tracking-tight">
          둘이 함께 보는
          <br />
          우리 집 자산
        </h1>
        <p className="mt-2 text-body text-muted-foreground">한 달에 한 번 정산하는 부부 자산관리</p>

        <LoginForm className="mt-9" />

        <p className="mt-6 text-center text-caption text-muted-foreground">계정은 관리자가 발급합니다.</p>
      </div>
    </main>
  );
}
