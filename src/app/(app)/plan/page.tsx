import type { Metadata } from "next";

import { PlanView } from "@/features/plan/plan-view";

export const metadata: Metadata = { title: "월급·배분" };

export default function PlanPage() {
  return <PlanView />;
}
