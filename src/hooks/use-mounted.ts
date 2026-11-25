import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * 서버 렌더링과 하이드레이션 동안에는 false, 그 뒤로는 true.
 * 브라우저에만 있는 상태(쿼리 캐시 등)로 화면이 달라지는 컴포넌트가
 * 서버가 보낸 HTML 과 어긋나지 않게 첫 렌더를 맞출 때 쓴다.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
