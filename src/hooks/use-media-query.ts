"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * CSS 미디어 쿼리 일치 여부. 서버와 첫 하이드레이션에서는 false 를 돌려준다
 * (모바일 우선: 일치 여부를 모를 때는 좁은 화면으로 본다).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind sm(640px) 이상. ResponsiveDialog 가 Dialog/Drawer 를 고를 때 쓴다. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 40rem)");
}
