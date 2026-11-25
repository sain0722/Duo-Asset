"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { watchAuth } from "@/lib/data/auth";
import { getQueryClient } from "@/lib/data/query-client";
import { isSupabaseConfigured } from "@/lib/data/supabase";

/**
 * 전역 Provider 를 한곳에서 구성한다(루트 레이아웃에서 한 번).
 *  - QueryClientProvider: 가구 데이터 캐시(메모리 전용). 같은 클라이언트를 로그아웃(lib/data/auth)이 비운다.
 *  - ThemeProvider + Toaster: 라이트/다크, 알림
 */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // 환경변수가 없으면(/setup) Supabase 클라이언트를 만들 수 없다.
    if (isSupabaseConfigured) return watchAuth();
  }, []);

  return (
    <QueryClientProvider client={getQueryClient()}>
      <ThemeProvider>
        {children}
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
