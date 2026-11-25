import type { Metadata } from "next";

import { JointView } from "@/features/joint/joint-view";

export const metadata: Metadata = { title: "공용통장" };

export default function JointPage() {
  return <JointView />;
}
