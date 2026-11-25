import { BottomTabs, MobileTopBar } from "./mobile-nav";
import { Sidebar } from "./sidebar";

/**
 * 앱 셸. PC(lg 이상)는 좌측 사이드바, 모바일은 상단 바 + 하단 탭.
 * 본문은 하단 탭과 홈 인디케이터에 가리지 않도록 그 높이만큼 아래를 비운다(pb-safe-14 = 탭 56px + safe-area).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
      <Sidebar />
      <MobileTopBar />
      <main className="flex min-w-0 flex-1 flex-col px-safe pb-safe-14 lg:pb-0">{children}</main>
      <BottomTabs />
    </div>
  );
}
