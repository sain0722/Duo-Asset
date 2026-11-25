"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageContainer } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { leaveIfSignedOut } from "@/lib/data/auth";
import { describeError } from "@/lib/data/errors";
import { useMounted } from "@/hooks/use-mounted";
import { HouseholdProvider, useHouseholdQuery } from "@/lib/data/hooks";

/**
 * 가구 데이터 게이트. (app) 레이아웃에서 셸 안쪽(본문)을 감싼다.
 *
 *  - 불러오는 중: 스켈레톤 (셸의 메뉴는 그대로 보인다)
 *  - 실패했고 보여 줄 데이터가 없음: 오류 화면 + 다시 시도
 *  - 가구가 없음(data === null): /onboarding 으로 이동
 *  - 데이터가 있음: HouseholdProvider 로 감싸 자식을 그린다 → 화면에서는 useHousehold() 가 항상 값을 준다
 *
 * 다시 읽다가 실패해도(포커스 재조회 등) 이미 받은 데이터는 계속 보여 준다.
 */
export function HouseholdGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, error, isError, isFetching, isPaused, refetch } = useHouseholdQuery();
  const mounted = useMounted();

  // 온보딩에서 가구를 만든 직후에는 캐시에 예전 값(null)이 남아 있을 수 있다. 다시 읽는 동안에는 판단을 미룬다.
  const hasNoHousehold = data === null && !isFetching;
  useEffect(() => {
    if (hasNoHousehold) router.replace("/onboarding");
  }, [hasNoHousehold, router]);

  // 세션이 사라져서 실패한 것이라면(만료 · 쿠키 삭제) 다시 시도해도 소용없다. 로그인 화면으로 보낸다.
  const failed = isError && !data;
  useEffect(() => {
    if (failed) void leaveIfSignedOut();
  }, [failed]);

  // 하이드레이션 중에는 서버가 보낸 것과 같은 스켈레톤을 그린다 (그 사이 데이터가 도착했더라도)
  if (data && mounted) return <HouseholdProvider value={data}>{children}</HouseholdProvider>;

  // isPaused: 오프라인이라 요청을 보내지 못하고 기다리는 중(연결되면 자동으로 이어진다)
  const offline = isPaused && data === undefined;
  if (failed || offline) {
    return (
      <PageContainer className="flex-1 justify-center">
        <EmptyState
          role="alert"
          title="데이터를 불러오지 못했습니다"
          description={offline ? "네트워크에 연결할 수 없습니다. 연결 상태를 확인해 주세요." : describeError(error)}
          action={
            <Button variant="outline" loading={isFetching} onClick={() => void refetch()}>
              다시 시도
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return <GateSkeleton />;
}

/** 화면 틀(PageContainer · PageHeader · 카드)과 같은 자리·크기의 스켈레톤. */
function GateSkeleton() {
  return (
    <PageContainer role="status" aria-label="불러오는 중">
      <div className="flex flex-col gap-2 py-0.5">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-44" />
      </div>
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <Skeleton className="h-36 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl lg:col-span-3" />
      </div>
    </PageContainer>
  );
}
