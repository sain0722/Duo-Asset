import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageContainer, PageHeader } from "@/components/page";
import { SectionTabs } from "@/components/section-tabs";
import { SECTION_TABS } from "@/components/shell/nav";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "미래 시뮬레이션" };

export default function SimulationPage() {
  return (
    <PageContainer>
      <PageHeader title="미래 시뮬레이션" description="지금 계획대로라면 자산이 어떻게 변할지 미리 봅니다." />
      <SectionTabs items={SECTION_TABS.goals} aria-label="목표 메뉴" />
      <Card>
        <EmptyState title="준비 중" description="이 화면은 곧 만들어집니다." />
      </Card>
    </PageContainer>
  );
}
