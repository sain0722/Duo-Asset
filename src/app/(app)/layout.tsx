import { AppShell } from "@/components/shell/app-shell";
import { HouseholdGate } from "@/components/shell/household-gate";

/**
 * 로그인 + 가구가 있어야 들어오는 영역.
 * 셸(메뉴)은 항상 보이고, 본문은 HouseholdGate 가 가구 데이터를 받은 뒤에 그린다.
 * 이 아래의 화면은 useHousehold() 로 데이터를 바로 쓸 수 있다.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell>
      <HouseholdGate>{children}</HouseholdGate>
    </AppShell>
  );
}
