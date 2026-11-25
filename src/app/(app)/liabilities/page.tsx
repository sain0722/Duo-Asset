import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageContainer, PageHeader } from "@/components/page";
import { SectionTabs } from "@/components/section-tabs";
import { SECTION_TABS } from "@/components/shell/nav";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "부채·고정지출" };

export default function LiabilitiesPage() {
  return (
    <PageContainer>
      <PageHeader title="부채·고정지출" description="대출·할부와 매달 나가는 돈을 관리합니다." />
      <SectionTabs items={SECTION_TABS.assets} aria-label="자산 메뉴" />
      <Card>
        <EmptyState title="준비 중" description="이 화면은 곧 만들어집니다." />
      </Card>
    </PageContainer>
  );
}
