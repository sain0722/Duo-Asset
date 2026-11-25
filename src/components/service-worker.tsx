"use client";

import { useEffect } from "react";

/**
 * 서비스 워커(public/sw.js) 등록. 운영 빌드에서만 등록한다.
 * 개발 서버에서는 자산 이름이 바뀌지 않아 캐시가 HMR 을 방해하므로, 남아 있는 워커가 있으면 해제한다.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) void registration.unregister();
      });
      return;
    }

    // updateViaCache: "none" — sw.js 를 HTTP 캐시에서 읽지 않고 항상 서버에 확인한다.
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // 등록에 실패해도(사설 모드 등) 앱은 그대로 동작한다. 캐시만 없을 뿐이다.
    });
  }, []);

  return null;
}
