import type { Metadata } from "next";

import { GoalsPage } from "@/features/goals/goals-page";

export const metadata: Metadata = { title: "목표" };

// 본문은 가구 데이터를 받은 뒤 브라우저에서 그린다(서버가 미리 그리는 것은 셸과 스켈레톤뿐).
// 그래서 이 화면은 "즉시 이동" 검증 대상이 아니다.
export const instant = false;

export default function Page() {
  return <GoalsPage />;
}
