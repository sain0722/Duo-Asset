"use client";

import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { useEffect } from "react";

import { THEME_COLOR } from "@/lib/theme-color";

/**
 * 라이트/다크 테마. <html> 에 .dark 클래스를 붙인다(기본값: 시스템 설정).
 * 테마 선택은 화면 설정일 뿐 금융 데이터가 아니므로 localStorage 에 저장해도 된다.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      // React 19 는 클라이언트에서 다시 그려지는 <script> 를 경고한다. 서버에서만 실행 가능한 타입으로 내보낸다.
      scriptProps={{ type: typeof window === "undefined" ? "text/javascript" : "text/plain" }}
    >
      <ThemeColorSync />
      {children}
    </NextThemesProvider>
  );
}

/**
 * 앱에서 고른 테마가 시스템 설정과 다를 때도 브라우저 UI 색이 화면 배경과 맞도록
 * <meta name="theme-color"> 를 실제 적용된 테마에 맞춘다.
 */
function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
    const color = THEME_COLOR[resolvedTheme];
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.content = color;
    }
  }, [resolvedTheme]);

  return null;
}
