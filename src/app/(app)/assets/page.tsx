import type { Metadata } from "next";

import { EmptyState } from "@/components/empty-state";
import { PageContainer, PageHeader } from "@/components/page";
import { SectionTabs } from "@/components/section-tabs";
import { SECTION_TABS } from "@/components/shell/nav";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "자산" };

export default function AssetsPage() {
  return (
    <PageContainer>
      <PageHeader title="자산" description="예금·투자·부동산 등 모든 자산을 한곳에서 봅니다." />
      <SectionTabs items={SECTION_TABS.assets} aria-label="자산 메뉴" />
      <Card>
        <EmptyState title="준비 중" description="이 화면은 곧 만들어집니다." />
      </Card>
    </PageContainer>
  );
}
