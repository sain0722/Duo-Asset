import type { Metadata } from "next";
import { Suspense } from "react";

import { SettlementScreen } from "@/features/settlement/settlement-screen";

export const metadata: Metadata = { title: "월 정산" };

export default function SettlementPage() {
  // ?month= 를 읽는 클라이언트 컴포넌트는 정적 셸에서 Suspense 경계가 필요하다
  return (
    <Suspense>
      <SettlementScreen />
    </Suspense>
  );
}
