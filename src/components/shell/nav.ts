import {
  CalendarCheck,
  ChartPie,
  CreditCard,
  House,
  Landmark,
  Settings,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * 내비게이션 정의. 사이드바(PC) · 하단 탭(모바일) · 화면 상단의 형제 탭(SectionTabs)이 모두 이 파일에서 나온다.
 * 메뉴를 추가·변경할 때는 여기만 고친다.
 */

export interface NavItem {
  href: string;
  /** PC 사이드바와 형제 탭에 쓰는 이름 */
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  id: "home" | "plan" | "settlement" | "assets" | "goals";
  /** 모바일 하단 탭 이름 */
  tab: string;
  /** 첫 항목이 하단 탭을 눌렀을 때 열리는 화면이다. 둘 이상이면 화면 상단에 형제 탭이 생긴다. */
  items: readonly NavItem[];
}

/** 모바일 하단 탭 5개 = 그룹, PC 사이드바 8개 = 모든 항목 */
export const NAV_GROUPS: readonly NavGroup[] = [
  { id: "home", tab: "홈", items: [{ href: "/", label: "홈", icon: House }] },
  {
    id: "plan",
    tab: "월급",
    items: [
      { href: "/plan", label: "월급·배분", icon: Wallet },
      { href: "/joint", label: "공용통장", icon: Landmark },
    ],
  },
  { id: "settlement", tab: "정산", items: [{ href: "/settlement", label: "월 정산", icon: CalendarCheck }] },
  {
    id: "assets",
    tab: "자산",
    items: [
      { href: "/assets", label: "자산", icon: ChartPie },
      { href: "/liabilities", label: "부채·고정지출", icon: CreditCard },
    ],
  },
  {
    id: "goals",
    tab: "목표",
    items: [
      { href: "/goals", label: "목표", icon: Target },
      { href: "/simulation", label: "미래 시뮬레이션", icon: TrendingUp },
    ],
  },
];

/** 설정: PC 는 사이드바 하단, 모바일은 상단 바 우측 아이콘 */
export const SETTINGS_ITEM: NavItem = { href: "/settings", label: "설정", icon: Settings };

/** PC 사이드바 항목 (그룹 순서대로 펼친 것) */
export const SIDEBAR_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** 현재 경로가 이 메뉴(또는 그 하위 경로, 예: /assets/[id])인가 */
export function isActivePath(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 현재 경로가 속한 그룹. 형제 경로(/joint → 월급)와 하위 경로에서도 하단 탭 표시가 유지된다. */
export function activeGroupId(pathname: string): NavGroup["id"] | null {
  const group = NAV_GROUPS.find((candidate) => candidate.items.some((item) => isActivePath(item.href, pathname)));
  return group?.id ?? null;
}

type SectionId = Exclude<NavGroup["id"], "home" | "settlement">;

function sectionTabs(id: SectionId): { href: string; label: string }[] {
  const group = NAV_GROUPS.find((candidate) => candidate.id === id);
  // 서버 컴포넌트에서 클라이언트 컴포넌트(SectionTabs)로 넘기므로 아이콘(함수)은 뺀다.
  return (group?.items ?? []).map(({ href, label }) => ({ href, label }));
}

/**
 * 형제 화면 사이를 오가는 탭. 각 화면의 PageHeader 아래에 둔다.
 *
 *   <SectionTabs items={SECTION_TABS.plan} aria-label="월급 메뉴" />
 */
export const SECTION_TABS: Record<SectionId, { href: string; label: string }[]> = {
  plan: sectionTabs("plan"),
  assets: sectionTabs("assets"),
  goals: sectionTabs("goals"),
};
