import type { Metadata } from "next";
import { Suspense } from "react";

import { SettlementScreen } from "@/features/settlement/settlement-screen";

export const metadata: Metadata = { title: "월 정산" };

// 본문은 가구 데이터를 받은 뒤 브라우저에서 그린다(서버가 미리 그리는 것은 셸과 스켈레톤뿐).
// 그래서 이 화면은 "즉시 이동" 검증 대상이 아니다.
export const instant = false;

export default function SettlementPage() {
  // ?month= 를 읽는 클라이언트 컴포넌트는 정적 셸에서 Suspense 경계가 필요하다
  return (
    <Suspense>
      <SettlementScreen />
    </Suspense>
  );
}
