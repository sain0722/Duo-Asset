/*
 * DuoAsset 서비스 워커
 *
 * 규칙: 금융 데이터는 캐시하지 않는다.
 *  - 캐시하는 것: 같은 출처의 정적 자산뿐이다 — /_next/static/* (JS · CSS · 폰트, 파일명에 해시가 있어 내용이 바뀌지 않는다)와 앱 아이콘.
 *  - 가로채지 않는 것: 페이지 탐색(HTML), RSC 요청, /api, 그리고 다른 출처로 가는 모든 요청(Supabase).
 *    이런 요청은 fetch 핸들러에서 respondWith 를 부르지 않고 그냥 return 한다 → 브라우저가 평소대로 네트워크에 보낸다.
 *  - 그래서 이 워커는 오프라인 화면을 제공하지 않는다. 두 번째 방문부터 정적 자산을 빨리 읽는 것과
 *    홈 화면 설치(PWA) 조건을 채우는 것이 목적이다.
 *
 * 캐시할 대상을 늘리려면 이 규칙을 먼저 확인한다(docs/architecture.md "PWA와 민감 정보").
 * 이 파일이나 앱 아이콘(파일명에 해시가 없다)을 고치면 VERSION 을 올린다. 이전 버전의 캐시는 activate 때 지운다.
 */
const VERSION = "v1";
const CACHE_PREFIX = "duoasset-static-";
const CACHE_NAME = CACHE_PREFIX + VERSION;

/** 해시가 붙은 빌드 자산이 배포마다 쌓이지 않게 하는 상한 */
const MAX_ENTRIES = 250;

const ICON_PATHS = ["/favicon.ico", "/icon.svg", "/apple-icon.png"];

function isStaticAsset(pathname) {
  return pathname.startsWith("/_next/static/") || pathname.startsWith("/icons/") || ICON_PATHS.includes(pathname);
}

self.addEventListener("install", () => {
  // 미리 받아 둘 목록은 없다. 새 워커가 바로 활성화되게 한다.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // 다른 출처(Supabase API · Auth)는 절대 건드리지 않는다.
  if (url.origin !== self.location.origin) return;
  // 페이지 탐색(HTML)과 RSC 요청은 항상 네트워크로. 로그인 여부를 서버(proxy)가 판단해야 한다.
  if (request.mode === "navigate" || request.destination === "document") return;
  if (request.headers.has("rsc") || url.searchParams.has("_rsc")) return;
  if (url.pathname.startsWith("/api/")) return;
  // 허용 목록에 없는 경로는 전부 통과시킨다.
  if (!isStaticAsset(url.pathname)) return;

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheable(response)) {
    // 응답 본문은 한 번만 읽을 수 있으므로 복제본을 저장한다. 저장 실패(용량 등)는 무시한다.
    cache
      .put(request, response.clone())
      .then(() => trim(cache))
      .catch(() => {});
  }
  return response;
}

function isCacheable(response) {
  if (!response.ok || response.type !== "basic") return false;
  // 정적 자산 경로에서 HTML 이 내려오면(오류 페이지 등) 저장하지 않는다.
  const type = response.headers.get("content-type") || "";
  return !type.includes("text/html") && !type.includes("text/x-component");
}

async function trim(cache) {
  const keys = await cache.keys();
  // keys() 는 저장한 순서다. 오래된 것부터 지운다.
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES)).map((key) => cache.delete(key)));
}
