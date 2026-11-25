"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * 토스트 영역. 루트 레이아웃에 한 번만 둔다. 알림은 sonner 의 toast() 로 띄운다.
 * 화면 위쪽에 띄워 모바일 하단 탭·하단 시트와 겹치지 않게 한다.
 */
function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-center"
      offset={{ top: "calc(env(safe-area-inset-top) + 16px)" }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border-0 !px-4 !py-3.5 !text-body !font-medium !shadow-pop !font-sans",
          description: "!text-sm !font-normal !opacity-80",
          actionButton: "!h-8 !rounded-lg !px-3 !text-sm !font-semibold",
        },
      }}
      style={
        {
          // 잉크색 토스트: 배경과 반대되는 색으로 띄워 어디서든 눈에 띈다.
          "--normal-bg": "var(--primary)",
          "--normal-text": "var(--primary-foreground)",
          "--normal-border": "transparent",
          "--border-radius": "var(--radius-xl)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
