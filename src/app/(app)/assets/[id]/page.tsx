import type { Metadata } from "next";
import { Suspense } from "react";

import { AssetDetail } from "@/features/assets/asset-detail";

export const metadata: Metadata = { title: "자산 상세" };

export default function AssetDetailPage() {
  // useParams 는 요청 시점에야 정해지므로 Suspense 로 감싼다 (cacheComponents)
  return (
    <Suspense>
      <AssetDetail />
    </Suspense>
  );
}
