import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageContainer, PageHeader } from "@/components/page";
import { SectionTabs } from "@/components/section-tabs";
import { ThemeSwitch } from "@/components/theme-switch";

export const metadata: Metadata = { title: "디자인 킷" };

const tabs = [
  { href: "/dev/kit", label: "화면 예시" },
  { href: "/dev/kit/controls", label: "컨트롤" },
];

/** 개발용 컴포넌트 쇼케이스. 운영 빌드에서는 열리지 않는다. */
export default function KitLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <PageContainer>
      <PageHeader title="디자인 킷" description="화면을 만드는 부품 모음. 금액은 모두 가상의 값입니다." actions={<ThemeSwitch size="sm" />} />
      <SectionTabs items={tabs} aria-label="디자인 킷 메뉴" />
      {children}
    </PageContainer>
  );
}
