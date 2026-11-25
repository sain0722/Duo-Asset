"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";

type Render = (pathname: string | null) => React.ReactNode;

function Current({ children }: { children: Render }) {
  return children(usePathname());
}

/**
 * 현재 경로를 넘겨받아 그린다(메뉴의 활성 표시용).
 * 동적 경로(/assets/[id] 등)는 프리렌더 중에 경로를 알 수 없어 usePathname 이 대기한다.
 * 그동안에는 pathname = null 로 그려 활성 표시 없는 메뉴가 정적 셸에 들어가게 한다.
 */
export function WithPathname({ children }: { children: Render }) {
  return (
    <Suspense fallback={children(null)}>
      <Current>{children}</Current>
    </Suspense>
  );
}
