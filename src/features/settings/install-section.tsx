"use client";

import { Download } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Chromium 계열만 보내는 설치 이벤트 (표준 타입에 없다) */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STANDALONE_QUERY = "(display-mode: standalone)";

function subscribeDisplayMode(onChange: () => void) {
  const media = window.matchMedia(STANDALONE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function isStandalone(): boolean {
  // iOS 사파리는 display-mode 대신 navigator.standalone 으로 알려 준다
  return window.matchMedia(STANDALONE_QUERY).matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function InstallSection() {
  const standalone = useSyncExternalStore(subscribeDisplayMode, isStandalone, () => false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    // 이벤트는 한 번만 쓸 수 있다
    setInstallEvent(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>앱 설치</CardTitle>
        <CardDescription>홈 화면에서 바로 열 수 있습니다. 금융 데이터는 기기에 저장되지 않습니다.</CardDescription>
        {standalone && (
          <CardAction>
            <Badge variant="brand">앱으로 실행 중</Badge>
          </CardAction>
        )}
      </CardHeader>
      {!standalone && (
        <CardContent className="flex flex-col gap-4">
          {installEvent && (
            <Button variant="outline" className="w-full sm:w-auto sm:self-start" onClick={install}>
              <Download aria-hidden />이 기기에 설치
            </Button>
          )}
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium">Android · Chrome</dt>
              <dd className="text-muted-foreground">오른쪽 위 메뉴(⋮) → 앱 설치 또는 홈 화면에 추가</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium">iPhone · Safari</dt>
              <dd className="text-muted-foreground">아래쪽 공유 버튼 → 홈 화면에 추가</dd>
            </div>
          </dl>
        </CardContent>
      )}
    </Card>
  );
}
