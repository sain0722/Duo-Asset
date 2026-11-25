"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { tabClassName, tabsListClassName } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type SectionTabItem = { href: string; label: string };

type SectionTabsProps = {
  items: readonly SectionTabItem[];
  /** 탭 묶음의 이름(스크린 리더용). 예: "월급 메뉴" */
  "aria-label"?: string;
  className?: string;
};

/** 현재 경로와 같거나 그 하위인 항목 중 가장 긴 href 를 고른다. */
function findActiveHref(items: readonly SectionTabItem[], pathname: string): string | null {
  let active: string | null = null;
  for (const { href } of items) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (active == null || href.length > active.length)) active = href;
  }
  return active;
}

function TabLinks({ items, activeHref, className, ...props }: SectionTabsProps & { activeHref: string | null }) {
  return (
    <nav data-slot="section-tabs" aria-label={props["aria-label"] ?? "하위 메뉴"} className={cn(tabsListClassName, className)}>
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(tabClassName, active && "text-foreground after:bg-foreground")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ActiveTabLinks(props: SectionTabsProps) {
  const pathname = usePathname();
  return <TabLinks {...props} activeHref={findActiveHref(props.items, pathname)} />;
}

/**
 * 형제 경로 사이를 오가는 링크 탭(예: 월급·배분 | 공용통장).
 * 한 화면 안에서 내용을 바꾸는 탭은 ui/tabs 를 쓴다.
 */
function SectionTabs(props: SectionTabsProps) {
  // 동적 경로([month] 등)에서는 프리렌더 중 경로를 알 수 없어 usePathname 이 대기한다.
  // 그동안에는 활성 표시 없는 탭을 먼저 보여 준다.
  return (
    <Suspense fallback={<TabLinks {...props} activeHref={null} />}>
      <ActiveTabLinks {...props} />
    </Suspense>
  );
}

export { SectionTabs };
export type { SectionTabItem, SectionTabsProps };
