import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageContainer, PageHeader } from "@/components/page";
import { SectionTabs } from "@/components/section-tabs";
import { SECTION_TABS } from "@/components/shell/nav";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "월급·배분" };

export default function PlanPage() {
  return (
    <PageContainer>
      <PageHeader title="월급·배분" description="두 사람의 수입과 고정지출, 저축 계획을 정합니다." />
      <SectionTabs items={SECTION_TABS.plan} aria-label="월급 메뉴" />
      <Card>
        <EmptyState title="준비 중" description="이 화면은 곧 만들어집니다." />
      </Card>
    </PageContainer>
  );
}
