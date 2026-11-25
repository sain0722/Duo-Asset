import type { Metadata } from "next";

import { HomeDashboard } from "@/features/home/home-dashboard";

export const metadata: Metadata = { title: "홈" };

export default function HomePage() {
  return <HomeDashboard />;
}
