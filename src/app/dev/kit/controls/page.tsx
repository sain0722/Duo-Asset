import { notFound } from "next/navigation";

import { KitControls } from "../kit-controls";

export default function KitControlsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KitControls />;
}
