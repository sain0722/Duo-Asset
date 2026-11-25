import type { MetadataRoute } from "next";

import { THEME_COLOR } from "@/lib/theme-color";

/** PWA 매니페스트 (/manifest.webmanifest). 아이콘은 scripts/generate-icons.mjs 가 만든다. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DuoAsset",
    short_name: "DuoAsset",
    description: "부부가 함께 쓰는 자산관리",
    lang: "ko",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    // 매니페스트에는 색을 하나만 적을 수 있다. 라이트 배경에 맞추고, 다크에서는 페이지의 theme-color 메타가 덮어쓴다.
    theme_color: THEME_COLOR.light,
    background_color: THEME_COLOR.light,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
