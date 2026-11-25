"use client";

import Link from "next/link";

import { Logo } from "@/components/logo";
import { PocketBadge } from "@/components/pocket-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useHouseholdQuery } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

import { isActivePath, SETTINGS_ITEM, SIDEBAR_ITEMS, type NavItem } from "./nav";
import { WithPathname } from "./with-pathname";

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 items-center gap-3 rounded-xl px-3 text-body font-medium text-muted-foreground",
        "transition-colors outline-none hover:bg-accent hover:text-foreground",
        "focus-visible:ring-[3px] focus-visible:ring-ring/40",
        active && "bg-secondary font-semibold text-foreground hover:bg-secondary",
      )}
    >
      <Icon aria-hidden className="size-[1.125rem] shrink-0" strokeWidth={active ? 2.25 : 1.75} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

/** 로그인한 사람. 가구 데이터가 오기 전에는 같은 크기의 스켈레톤. */
function CurrentUser() {
  const { data } = useHouseholdQuery();

  if (!data) {
    return (
      <div className="flex h-14 flex-col justify-center gap-2 px-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-28" />
      </div>
    );
  }

  // 구성원 색은 sort_order 순서로 정해진다(구성원 1 · 2). 어느 화면에서나 같은 사람은 같은 색이다.
  const tone = data.members.findIndex((member) => member.id === data.me.id) === 1 ? "member-2" : "member-1";
  return (
    <div className="flex h-14 min-w-0 flex-col justify-center px-3">
      <PocketBadge tone={tone} className="font-semibold">
        {data.me.name}
      </PocketBadge>
      <p className="truncate pl-3.5 text-caption text-muted-foreground">{data.household.name}</p>
    </div>
  );
}

/** PC(lg 이상) 좌측 사이드바. */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-card lg:flex">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link href="/" aria-label="DuoAsset 홈" className="flex h-11 items-center rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
          <Logo />
        </Link>
      </div>

      <WithPathname>
        {(pathname) => (
          <>
            <nav aria-label="주 메뉴" className="flex-1 overflow-y-auto px-3 py-2">
              <ul className="flex flex-col gap-1">
                {SIDEBAR_ITEMS.map((item) => (
                  <li key={item.href}>
                    <SidebarLink item={item} active={pathname != null && isActivePath(item.href, pathname)} />
                  </li>
                ))}
              </ul>
            </nav>

            <div className="flex shrink-0 flex-col gap-1 border-t px-3 py-3">
              <SidebarLink item={SETTINGS_ITEM} active={pathname != null && isActivePath(SETTINGS_ITEM.href, pathname)} />
              <CurrentUser />
            </div>
          </>
        )}
      </WithPathname>
    </aside>
  );
}
