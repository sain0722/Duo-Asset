import type { Metadata, Viewport } from "next";

import { ServiceWorker } from "@/components/service-worker";
import { THEME_COLOR } from "@/lib/theme-color";

import { Providers } from "./providers";

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
  // 홈 화면에 추가했을 때 주소창 없이 앱처럼 열린다. (아이콘: app/apple-icon.png, 매니페스트: app/manifest.ts)
  appleWebApp: { capable: true, title: "DuoAsset", statusBarStyle: "default" },
  // Next 는 mobile-web-app-capable 만 내보낸다. 구형 iOS Safari 는 apple- 접두사가 붙은 이름만 읽는다.
  other: { "apple-mobile-web-app-capable": "yes" },
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
        <Providers>{children}</Providers>
        <ServiceWorker />
      </body>
    </html>
  );
}
