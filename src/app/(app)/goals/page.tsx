import type { Metadata } from "next";

import { GoalsPage } from "@/features/goals/goals-page";

export const metadata: Metadata = { title: "목표" };

export default function Page() {
  return <GoalsPage />;
}
