import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonthOnly } from "@/lib/format";
import { cn } from "@/lib/utils";

import { nextSetupStep, type SettlementNotice, type SetupStep, type SetupStepKey } from "./home-model";

const focusRing = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40";

/** 정산할 달이 밀렸거나 이번 달 말이 다가오면 정산 화면으로 안내한다. */
export function SettlementNoticeLink({ notice, className }: { notice: NonNullable<SettlementNotice>; className?: string }) {
  const month = formatMonthOnly(notice.month);
  const title = notice.kind === "overdue" ? `${month} 정산을 마무리하세요` : "이번 달 정산 준비";
  const detail =
    notice.kind === "prepare"
      ? [notice.daysLeft === 0 ? "오늘이 말일" : `말일까지 ${notice.daysLeft}일`, unconfirmedText(notice.unconfirmed)]
      : [unconfirmedText(notice.unconfirmed)];

  return (
    <Link
      href="/settlement"
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-2xl border bg-card px-5 py-3.5 transition-colors hover:bg-accent sm:px-6",
        focusRing,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", notice.kind === "overdue" ? "bg-warning" : "bg-brand")}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body font-semibold">{title}</span>
        <span className="text-caption text-muted-foreground">{detail.join(" · ")}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function unconfirmedText(count: number): string {
  return count === 0 ? "모두 확인했어요, 마감만 남았어요" : `미확인 ${count}건`;
}

const STEPS: Record<SetupStepKey, { title: string; description: string; href: string }> = {
  assets: { title: "자산 등록", description: "통장·예적금·투자·보증금의 기준 월 잔액", href: "/assets" },
  liabilities: { title: "부채 등록", description: "대출·할부·차용금. 없으면 건너뛰세요", href: "/liabilities" },
  plan: { title: "월급·배분 설정", description: "월급, 공용통장 입금, 저축 계획", href: "/plan" },
  close: { title: "기준 월 마감", description: "잔액을 확인하고 첫 달을 마감", href: "/settlement" },
};

/** 첫 마감 전 시작하기 단계 */
export function SetupChecklist({ steps, className }: { steps: SetupStep[]; className?: string }) {
  const next = nextSetupStep(steps);
  const doneCount = steps.filter((step) => step.done).length;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>시작하기</CardTitle>
        <CardDescription>기준 월을 마감하면 다음 달부터 매달 5분 정산을 시작할 수 있어요.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="-mx-2 flex flex-col" aria-label={`시작하기 ${steps.length}단계 중 ${doneCount}단계 완료`}>
          {steps.map((step, index) => {
            const meta = STEPS[step.key];
            const isNext = step.key === next;
            return (
              <li key={step.key}>
                <Link
                  href={meta.href}
                  aria-current={isNext ? "step" : undefined}
                  className={cn(
                    "flex min-h-16 items-center gap-3.5 rounded-xl px-2 py-2.5 transition-colors hover:bg-accent",
                    focusRing,
                  )}
                >
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-content-center rounded-full text-sm font-semibold tabular-nums",
                      step.done
                        ? "bg-brand text-brand-foreground"
                        : isNext
                          ? "bg-primary text-primary-foreground"
                          : "border text-muted-foreground",
                    )}
                  >
                    {step.done ? <Check aria-label="완료" className="size-4" strokeWidth={2.5} /> : index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn("text-body font-semibold", step.done && "text-muted-foreground")}>
                      {meta.title}
                    </span>
                    <span className="text-caption text-muted-foreground">{meta.description}</span>
                  </span>
                  {isNext ? (
                    <Badge variant="solid">다음</Badge>
                  ) : (
                    step.optional && !step.done && <Badge variant="outline">선택</Badge>
                  )}
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
