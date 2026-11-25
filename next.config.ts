import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** Supabase 프로젝트의 출처. 브라우저가 연결할 수 있는 외부 주소는 이것 하나뿐이다. */
function supabaseOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
}

/**
 * Content-Security-Policy. 페이지가 정적으로 프리렌더되므로 nonce 를 쓰지 않는다.
 * script-src 의 'unsafe-inline' 은 Next 의 하이드레이션 데이터와 next-themes 의 테마 초기화 인라인 스크립트에 필요하다.
 * 외부 스크립트·스타일·폰트·이미지는 모두 막고, 연결은 자기 출처와 Supabase 만 허용한다.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // 개발 서버의 HMR 은 웹소켓을 쓴다.
  ["connect-src 'self'", supabaseOrigin(), isDev ? "ws://localhost:* ws://127.0.0.1:*" : ""].filter(Boolean).join(" "),
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // HTTPS 로 한 번 접속한 브라우저는 이후에도 HTTPS 만 쓴다(HTTP 로 받은 응답에서는 무시된다).
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];

const nextConfig: NextConfig = {
  // 개발 서버를 http://127.0.0.1:3000 으로 열어도 HMR 이 동작하게 한다 (기본은 localhost 만 허용)
  allowedDevOrigins: ["127.0.0.1"],
  // E2E 테스트는 별도 폴더(.next-e2e)에 빌드해 개발 서버(.next)와 동시에 돌릴 수 있게 한다
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // 서비스 워커는 항상 서버에서 최신 파일을 확인한다. 워커 안에서는 같은 출처 요청만 한다.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
