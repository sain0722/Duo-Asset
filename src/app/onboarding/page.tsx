import type { Metadata } from "next";

import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";

export const metadata: Metadata = { title: "시작하기" };

/** 로그인했지만 아직 가구가 없는 사용자(HouseholdGate 가 보낸다): 초대 연결 또는 가구 만들기. */
export default function OnboardingPage() {
  return <OnboardingScreen />;
}
