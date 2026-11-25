import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/shell/sign-out-button";

export const metadata: Metadata = { title: "시작하기" };

/**
 * 온보딩 자리표시. 로그인은 했지만 아직 가구가 없는 사용자가 온다(HouseholdGate 가 보낸다).
 * 가구 만들기 · 초대 수락 화면이 여기에 들어온다. 가구를 만든 뒤에는 가구 쿼리를 무효화하고 / 로 이동한다.
 */
export default function OnboardingPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 pt-safe-10 pb-safe-10">
      <Logo />
      <EmptyState
        title="가구 만들기 준비 중"
        description="우리 집 가구를 만들고 배우자를 초대하는 화면이 곧 들어옵니다."
        action={<SignOutButton />}
      />
    </main>
  );
}
