import { Money } from "@/components/money";
import { PocketBadge } from "@/components/pocket-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { pocketName, pocketTone } from "@/lib/data/derive";
import type { HouseholdData } from "@/lib/data/types";
import { EVENT_KIND_LABELS } from "@/lib/finance";
import { addMonths } from "@/lib/month";
import { formatDate, formatMonthOnly, formatPercent, formatYm } from "@/lib/format";

import { type AheadItem, type PayDayItem, type Upcoming } from "./home-model";

const PAY_KIND_LABELS: Record<PayDayItem["kind"], string> = {
  income: "급여일",
  expense: "고정지출",
  debt: "부채 납부",
};

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h4 className="text-caption font-medium text-muted-foreground">{title}</h4>
      <ul className="divide-y">{children}</ul>
    </section>
  );
}

function Item({ lead, title, note, value, valueNote }: {
  lead?: React.ReactNode;
  title: React.ReactNode;
  note: React.ReactNode;
  value?: React.ReactNode;
  valueNote?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      {lead}
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium">{title}</p>
        <p className="truncate text-caption text-muted-foreground">{note}</p>
      </div>
      {value != null && (
        <div className="shrink-0 text-right">
          <p className="text-body font-semibold">{value}</p>
          {valueNote && <p className="text-caption text-muted-foreground">{valueNote}</p>}
        </div>
      )}
    </li>
  );
}

function aheadItem(item: AheadItem) {
  switch (item.kind) {
    case "debt_end":
      return (
        <Item
          key={item.key}
          title={`${item.name} 상환 끝`}
          note={`${formatYm(item.month)} 마지막 납부`}
          value={<Money amount={item.freed} sign />}
          valueNote={`${formatMonthOnly(addMonths(item.month, 1))}부터 매달 여유`}
        />
      );
    case "maturity":
      return (
        <Item
          key={item.key}
          title={`${item.name} 만기`}
          note={formatDate(item.date)}
          value={<Money amount={item.value} />}
          valueNote="현재 평가금액"
        />
      );
    case "event":
      return (
        <Item
          key={item.key}
          title={item.name}
          note={`${formatYm(item.month)} · ${EVENT_KIND_LABELS[item.eventKind]}`}
          value={item.amount === null ? undefined : <Money amount={item.amount} sign />}
          valueNote={item.eventKind === "one_time" ? "한 번" : "매달"}
        />
      );
  }
}

export function UpcomingCard({ data, upcoming, className }: { data: HouseholdData; upcoming: Upcoming; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>다가오는 일</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-3 lg:gap-8">
        {upcoming.thisMonth.length > 0 && (
          <Group title="이번 달 남은 일정">
            {upcoming.thisMonth.map((item) => (
              <Item
                key={item.key}
                lead={<span className="w-9 shrink-0 text-body font-semibold tabular-nums">{item.day}일</span>}
                title={item.name}
                note={
                  <span className="inline-flex items-center gap-1.5">
                    {PAY_KIND_LABELS[item.kind]} ·
                    <PocketBadge tone={pocketTone(data, item.pocket)} className="text-caption font-normal">
                      {pocketName(data, item.pocket)}
                    </PocketBadge>
                  </span>
                }
                value={<Money amount={item.amount} sign={item.kind === "income"} />}
              />
            ))}
          </Group>
        )}
        {upcoming.ahead.length > 0 && (
          <Group title="앞으로">{upcoming.ahead.map(aheadItem)}</Group>
        )}
        {upcoming.goals.length > 0 && (
          <Group title="진행 중인 목표">
            {upcoming.goals.map((goal) => (
              <li key={goal.goalId} className="flex flex-col gap-2 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-body font-medium">{goal.name}</p>
                  <span className="shrink-0 text-body font-semibold text-brand tabular-nums">
                    {formatPercent(goal.percent)}
                  </span>
                </div>
                <Progress value={goal.percent} aria-label={`${goal.name} 달성률`} />
                <p className="flex justify-between gap-3 text-caption text-muted-foreground">
                  <span>
                    남은 금액 <Money amount={goal.remaining} compact />
                  </span>
                  {goal.expectedMonth && <span>{formatYm(goal.expectedMonth)} 예상</span>}
                </p>
              </li>
            ))}
          </Group>
        )}
      </CardContent>
    </Card>
  );
}
