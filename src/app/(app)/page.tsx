import type { Metadata } from "next";

import { HomePlaceholder } from "./home-placeholder";

export const metadata: Metadata = { title: "홈" };

export default function HomePage() {
  return <HomePlaceholder />;
}
