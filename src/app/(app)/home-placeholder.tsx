"use client";

import { EmptyState } from "@/components/empty-state";
import { PageContainer, PageHeader } from "@/components/page";
import { PocketBadge } from "@/components/pocket-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHousehold } from "@/lib/data/hooks";

/** 홈 자리표시. 가구 데이터 게이트가 동작하는지 볼 수 있게 가구와 구성원 이름만 보여 준다. */
export function HomePlaceholder() {
  const { household, members, me } = useHousehold();

  return (
    <PageContainer>
      <PageHeader title={household.name} description={`${me.name} 님, 안녕하세요.`} />
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>구성원</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {members.map((member, index) => (
                <li key={member.id} className="flex items-center justify-between gap-3">
                  <PocketBadge tone={index === 1 ? "member-2" : "member-1"} className="text-body">
                    {member.name}
                  </PocketBadge>
                  {member.id === me.id && <span className="text-caption text-muted-foreground">나</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <EmptyState title="준비 중" description="홈 대시보드가 여기에 들어옵니다." />
        </Card>
      </div>
    </PageContainer>
  );
}
