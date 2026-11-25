import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageContainer, PageHeader } from "@/components/page";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "월 정산" };

export default function SettlementPage() {
  return (
    <PageContainer>
      <PageHeader title="월 정산" description="한 달에 한 번, 잔액을 적고 결과를 확인합니다." />
      <Card>
        <EmptyState title="준비 중" description="이 화면은 곧 만들어집니다." />
      </Card>
    </PageContainer>
  );
}
