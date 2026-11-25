import type { Metadata, Viewport } from "next";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { THEME_COLOR } from "@/lib/theme-color";

// Pretendard Variable 을 node_modules 에서 그대로 번들한다(자체 호스팅, 외부 CDN 없음).
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DuoAsset",
    template: "%s · DuoAsset",
  },
  description: "부부가 함께 쓰는 자산관리. 한 달에 한 번 정산으로 수입·저축·자산·부채와 미래 계획을 관리합니다.",
  applicationName: "DuoAsset",
  // 두 사람만 쓰는 비공개 서비스다.
  robots: { index: false, follow: false },
  // iOS 가 금액을 전화번호로 인식해 링크로 바꾸지 않게 한다.
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { capable: true, title: "DuoAsset", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // next-themes 가 하이드레이션 전에 <html> 의 class 를 바꾸므로 경고를 끈다.
    <html lang="ko" suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
