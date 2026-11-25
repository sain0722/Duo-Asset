"use client";

import { EmptyState } from "@/components/empty-state";
import { PageContainer } from "@/components/page";
import { Button } from "@/components/ui/button";

/** 화면을 그리다 난 오류. 셸(메뉴)은 그대로 두고 본문만 대신한다. */
export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <PageContainer className="flex-1 justify-center">
      <EmptyState
        role="alert"
        title="화면을 표시하지 못했습니다"
        description="잠시 후 다시 시도해 주세요. 문제가 계속되면 새로고침해 주세요."
        action={
          <Button variant="outline" onClick={() => retry()}>
            다시 시도
          </Button>
        }
      />
    </PageContainer>
  );
}
