import type { Metadata } from "next";

import { SimulationPage } from "@/features/simulation/simulation-page";

export const metadata: Metadata = { title: "미래 시뮬레이션" };

export default function Page() {
  return <SimulationPage />;
}
