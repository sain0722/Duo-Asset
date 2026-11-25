import { QueryClient } from "@tanstack/react-query";

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 30초 안에 다시 마운트되면 캐시를 그대로 쓰고, 창에 포커스가 돌아오면 다시 읽는다.
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        // 실패하면 한 번만 다시 시도하고 오류 화면을 보여 준다(기본 3회는 10초 가까이 걸린다).
        retry: 1,
      },
    },
  });
}

let browserClient: QueryClient | undefined;

/**
 * TanStack Query 클라이언트. 브라우저에서는 하나만 만들어 Provider 와 로그아웃(auth.ts)이 같이 쓴다.
 * 캐시는 메모리에만 둔다 — persist 플러그인으로 localStorage·IndexedDB 에 저장하지 않는다.
 */
export function getQueryClient(): QueryClient {
  // 서버(프리렌더)에서는 요청끼리 캐시가 섞이지 않게 매번 새로 만든다.
  if (typeof window === "undefined") return createQueryClient();
  browserClient ??= createQueryClient();
  return browserClient;
}
