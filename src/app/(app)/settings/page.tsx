import type { Metadata } from "next";

import { SettingsPlaceholder } from "./settings-placeholder";

export const metadata: Metadata = { title: "설정" };

export default function SettingsPage() {
  return <SettingsPlaceholder />;
}
