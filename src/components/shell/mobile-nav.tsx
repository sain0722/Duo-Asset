"use client";

import Link from "next/link";

import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

import { activeGroupId, isActivePath, NAV_GROUPS, SETTINGS_ITEM } from "./nav";
import { WithPathname } from "./with-pathname";

const focusRing = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40";

/** 모바일 상단 바: 로고 + 설정. 노치(safe-area) 아래에 붙는다. */
export function MobileTopBar() {
  const SettingsIcon = SETTINGS_ITEM.icon;
  return (
    <header className="sticky top-0 z-30 bg-background/90 pt-safe backdrop-blur-md lg:hidden">
      <div className="px-safe">
        <div className="flex h-14 items-center justify-between pr-1.5 pl-4 sm:pr-3.5 sm:pl-6">
          <Link href="/" aria-label="DuoAsset 홈" className={cn("flex h-11 items-center rounded-lg", focusRing)}>
            <Logo />
          </Link>
          <WithPathname>
            {(pathname) => {
              const active = pathname != null && isActivePath(SETTINGS_ITEM.href, pathname);
              return (
                <Link
                  href={SETTINGS_ITEM.href}
                  aria-label={SETTINGS_ITEM.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors",
                    "hover:bg-accent hover:text-foreground",
                    active && "text-foreground",
                    focusRing,
                  )}
                >
                  <SettingsIcon aria-hidden className="size-[1.375rem]" strokeWidth={active ? 2.25 : 1.75} />
                </Link>
              );
            }}
          </WithPathname>
        </div>
      </div>
    </header>
  );
}

/** 모바일 하단 탭 5개. 홈 인디케이터(safe-area) 위에 붙는다. 본문은 AppShell 이 이 높이만큼 띄운다. */
export function BottomTabs() {
  return (
    <nav aria-label="주 메뉴" className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-safe backdrop-blur-md lg:hidden">
      <WithPathname>
        {(pathname) => {
          const activeId = pathname == null ? null : activeGroupId(pathname);
          return (
            <ul className="mx-auto flex h-14 max-w-xl px-safe">
              {NAV_GROUPS.map((group) => {
                const { href, icon: Icon } = group.items[0];
                const active = group.id === activeId;
                return (
                  <li key={group.id} className="flex-1">
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-full flex-col items-center justify-center gap-0.5 rounded-lg text-xs font-medium text-muted-foreground",
                        "transition-colors focus-visible:ring-inset",
                        active && "font-semibold text-foreground",
                        focusRing,
                      )}
                    >
                      <Icon aria-hidden className="size-[1.375rem]" strokeWidth={active ? 2.25 : 1.75} />
                      {group.tab}
                    </Link>
                  </li>
                );
              })}
            </ul>
          );
        }}
      </WithPathname>
    </nav>
  );
}
