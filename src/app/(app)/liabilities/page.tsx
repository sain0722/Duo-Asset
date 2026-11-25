import type { Metadata } from "next";

import { LiabilitiesView } from "@/features/liabilities/liabilities-view";

export const metadata: Metadata = { title: "부채·고정지출" };

export default function LiabilitiesPage() {
  return <LiabilitiesView />;
}
