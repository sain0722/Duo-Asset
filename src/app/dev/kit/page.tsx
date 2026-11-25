import { notFound } from "next/navigation";

import { KitOverview } from "./kit-overview";

export default function KitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KitOverview />;
}
