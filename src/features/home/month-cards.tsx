import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Delta, Money } from "@/components/money";
import { PocketBadge } from "@/components/pocket-badge";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { pocketName, pocketTone } from "@/lib/data/derive";
import type { HouseholdData } from "@/lib/data/types";
import { plannedJointConsumption } from "@/lib/finance";
import type { MonthPlan } from "@/lib/finance/types";
import { formatMonthOnly, formatPercent } from "@/lib/format";

import type { SettlementResult } from "./home-model";
import {
  AchievementTip,
  AllowanceTip,
  InvestmentGainTip,
  JointActualTip,
  JointBudgetTip,
  PlanIncomeTip,
  PlanSavingsTip,
  SavingsRateTip,
  SavingsTip,
} from "./terms";

function Row({ label, info, children }: { label: React.ReactNode; info?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <dt className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
        {label}
        {info}
      </dt>
      <dd className="flex shrink-0 items-center gap-2 text-body font-semibold">{children}</dd>
    </div>
  );
}

/** 이번 달(달력 기준) 계획: 월급·배분 설정에서 나온 값 */
export function PlanCard({ data, plan, className }: { data: HouseholdData; plan: MonthPlan; className?: string }) {
  const month = formatMonthOnly(plan.month);
  const header = (
    <CardHeader>
      <CardTitle>{month} 계획</CardTitle>
      <CardDescription>월급·배분 설정 기준</CardDescription>
      <CardAction>
        <Button asChild variant="ghost" size="sm" className="-mr-2">
          <Link href="/plan">자세히</Link>
        </Button>
      </CardAction>
    </CardHeader>
  );

  if (plan.lines.length === 0) {
    return (
      <Card className={className}>
        {header}
        <EmptyState
          className="py-6"
          title="월급과 배분을 설정해 주세요"
          description="월급, 공용통장 입금, 저축 계획을 넣으면 매달 쓸 수 있는 돈을 계산해 드려요."
          action={
            <Button asChild variant="secondary">
              <Link href="/plan">월급·배분 설정</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <Card className={className}>
      {header}
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="합산 월수입" info={<PlanIncomeTip />} value={<Money amount={plan.totals.income} compact />} />
          <Stat label="예상 저축액" info={<PlanSavingsTip />} value={<Money amount={plan.totals.savings} compact />} />
        </div>
        <Separator />
        <dl className="flex flex-col gap-2.5">
          <div className="flex items-center gap-1 text-caption font-medium text-muted-foreground">
            개인 사용 가능 금액
            <AllowanceTip />
          </div>
          {plan.members.map((member) => (
            <Row
              key={member.memberId}
              label={<PocketBadge tone={pocketTone(data, member.memberId)} className="text-foreground">{pocketName(data, member.memberId)}</PocketBadge>}
            >
              {member.allowance < 0 && <Badge variant="warning">초과 배분</Badge>}
              <Money amount={member.allowance} />
            </Row>
          ))}
          <Separator className="my-1" />
          <Row
            label={<PocketBadge tone="joint" className="text-foreground">공동생활비 예산</PocketBadge>}
            info={<JointBudgetTip />}
          >
            <Money amount={plannedJointConsumption(plan.joint)} />
          </Row>
        </dl>
      </CardContent>
    </Card>
  );
}

/** 마지막으로 마감한 달의 동결 결과 */
export function ResultCard({ result, className }: { result: SettlementResult | null; className?: string }) {
  if (!result) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>지난 정산 결과</CardTitle>
        </CardHeader>
        <EmptyState
          className="py-6"
          title="첫 정산을 마치면 표시됩니다"
          description="기준 월 다음 달을 마감하면 실제 저축액과 계획 대비 달성률을 보여 드려요."
        />
      </Card>
    );
  }

  const { report, achievement, joint } = result;
  const overBudget = joint !== null && joint.percent !== null && joint.percent > 100;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{formatMonthOnly(result.month)} 정산 결과</CardTitle>
        <CardDescription>마감한 결과</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Stat
          label="실제 저축액"
          info={<SavingsTip />}
          value={<Money amount={report.savings} />}
          sub={
            <>
              계획 <Money amount={report.plan.savings} />
            </>
          }
        />
        <div className="flex flex-col gap-2">
          <Progress value={achievement} aria-label="저축 목표 달성률" />
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              저축 목표 달성률
              <AchievementTip />
            </span>
            <span className="font-semibold text-brand tabular-nums">
              {achievement === null ? "계획 저축 없음" : formatPercent(achievement)}
            </span>
          </div>
        </div>
        <Separator />
        <dl className="flex flex-col gap-2.5">
          <Row label="저축률" info={<SavingsRateTip />}>
            <span className="tabular-nums">{report.savingsRate === null ? "—" : formatPercent(report.savingsRate)}</span>
          </Row>
          <Row label="투자 평가손익" info={<InvestmentGainTip />}>
            <Delta amount={report.investmentGain} />
          </Row>
        </dl>
        {joint && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1">
                <PocketBadge tone="joint" className="font-normal text-muted-foreground">
                  공동생활비
                </PocketBadge>
                <JointActualTip />
              </span>
              <span className="flex items-center gap-2 text-body font-semibold">
                {overBudget && <Badge variant="warning">예산 초과</Badge>}
                <Money amount={joint.actual} />
              </span>
            </div>
            <Progress value={joint.percent} tone={overBudget ? "warning" : "joint"} aria-label="공동생활비 예산 사용률" />
            <p className="flex justify-between text-caption text-muted-foreground">
              <span>
                예산 <Money amount={joint.budget} />
              </span>
              {joint.percent !== null && <span className="tabular-nums">{formatPercent(joint.percent)}</span>}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

