import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageContainer, PageHeader } from "@/components/page";
import { SectionTabs } from "@/components/section-tabs";
import { SECTION_TABS } from "@/components/shell/nav";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "목표" };

export default function GoalsPage() {
  return (
    <PageContainer>
      <PageHeader title="목표" description="모으려는 돈과 달성 상황을 봅니다." />
      <SectionTabs items={SECTION_TABS.goals} aria-label="목표 메뉴" />
      <Card>
        <EmptyState title="준비 중" description="이 화면은 곧 만들어집니다." />
      </Card>
    </PageContainer>
  );
}
