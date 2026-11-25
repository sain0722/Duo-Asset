"use client";

import { EmptyState } from "@/components/empty-state";
import { PageContainer, PageHeader } from "@/components/page";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { ThemeSwitch } from "@/components/theme-switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHousehold } from "@/lib/data/hooks";

/** 설정 자리표시. 테마와 로그아웃만 동작한다. 가구·구성원 관리, 백업은 이후에 들어온다. */
export function SettingsPlaceholder() {
  const { household, me } = useHousehold();

  return (
    <PageContainer size="narrow">
      <PageHeader title="설정" />

      <Card>
        <CardHeader>
          <CardTitle>화면</CardTitle>
          <CardDescription>라이트·다크 테마를 고릅니다. 시스템은 기기 설정을 따릅니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSwitch fullWidth />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>계정</CardTitle>
          <CardDescription>
            {me.name}
            {me.email ? ` · ${me.email}` : ""} · {household.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton className="w-full sm:w-auto" />
        </CardContent>
      </Card>

      <Card>
        <EmptyState title="준비 중" description="가구·구성원 관리와 백업이 여기에 들어옵니다." />
      </Card>
    </PageContainer>
  );
}
