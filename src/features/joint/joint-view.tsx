"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { InfoTip } from "@/components/info-tip";
import { Delta, Money } from "@/components/money";
import { MonthSwitcher } from "@/components/month-switcher";
import { PageContainer, PageHeader } from "@/components/page";
import { PocketBadge, type PocketTone } from "@/components/pocket-badge";
import { SectionTabs } from "@/components/section-tabs";
import { SECTION_TABS } from "@/components/shell/nav";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { findMonth, history, lastClosedMonth, planForMonth, pocketName, pocketTone, reportFor, workingMonth } from "@/lib/data/derive";
import { useHousehold } from "@/lib/data/hooks";
import { percentOf } from "@/lib/finance";
import type { Ym } from "@/lib/finance/types";
import { formatMonthOnly, formatPercent, formatYm, formatYmShort } from "@/lib/format";
import { cn } from "@/lib/utils";

import { jointHistory, jointMonthSummary, type JointHistoryRow, type JointMonthSummary } from "./joint-summary";

const HISTORY_MONTHS = 6;

/* 문구는 docs/finance-rules.md 4·5절과 맞춘다 */
const TIPS = {
  savings:
    "공동 주머니 자산(공용통장 포함)의 순투입 합입니다. 공용통장에 남긴 돈과 공동 예금·적금으로 옮긴 돈이 모두 들어갑니다.",
  consumption:
    "공동 주머니 소비 = 들어온 돈 − 나간 이동 − 공동 자산 순투입 − 공동 부채 원금 순상환입니다. 공용통장 입금과 적금 이체는 소비가 아니라 자금 이동이라 들어가지 않습니다.",
  unclassified:
    "공동 소비 중 확인한 지출(지출 항목과 확인된 이자)을 뺀 나머지입니다. 공동 주머니에서는 사실상 공동생활비입니다. 임의의 항목으로 확정하지 않습니다.",
  movedOut:
    "공용통장이 아닌 공동 자산(예금·적금 등)에 넣은 순투입과, 공동 주머니에서 개인 주머니로 보낸 돈입니다. 소비가 아닙니다.",
  balance: "공동 소유 현금·입출금 자산(공용통장)의 잔액입니다. 월초 잔액은 지난달 정산 결과의 월말 잔액입니다.",
  contribution: "개인 통장에서 공용통장으로 옮긴 돈입니다. 가구 전체로 보면 위치만 바뀌므로 소비도 저축도 아닙니다.",
};

export function JointView() {
  const data = useHousehold();
  const defaultMonth = (lastClosedMonth(data) ?? workingMonth(data) ?? data.months.at(-1))?.month ?? null;
  const [selected, setSelected] = useState<Ym | null>(defaultMonth);

  const header = (
    <>
      <PageHeader title="공용통장" description="두 사람이 넣은 돈이 어디에 쓰이고 얼마나 남았는지 봅니다." />
      <SectionTabs items={SECTION_TABS.plan} aria-label="월급 메뉴" />
    </>
  );

  const row = selected ? findMonth(data, selected) : null;
  if (!row) {
    return (
      <PageContainer>
        {header}
        <Card>
          <EmptyState
            title="아직 기록한 달이 없어요"
            description="첫 정산을 하면 공용통장 흐름이 여기에 보입니다."
            action={
              <Button asChild variant="secondary">
                <Link href="/settlement">정산하러 가기</Link>
              </Button>
            }
          />
        </Card>
      </PageContainer>
    );
  }

  const report = reportFor(data, row);
  const plan = planForMonth(data, row.month);
  const summary = jointMonthSummary(report, plan.joint, data.members.map((member) => member.id));
  const settled = summary.complete && !summary.isBaseline;
  const rows = jointHistory(history(data), HISTORY_MONTHS);

  const badge =
    row.status === "closed" ? (
      <Badge>마감</Badge>
    ) : summary.isBaseline ? (
      <Badge variant="outline">기준 월</Badge>
    ) : summary.complete ? (
      <Badge variant="brand">정산 완료 · 마감 전</Badge>
    ) : (
      <Badge variant="warning">정산 전</Badge>
    );

  return (
    <PageContainer>
      {header}

      <div className="flex items-center gap-2">
        <MonthSwitcher value={row.month} onChange={setSelected} min={data.months[0].month} max={data.months.at(-1)!.month} className="-ml-2.5" />
        {badge}
      </div>

      {!summary.complete && !summary.isBaseline && (
        <div className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning/8 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-semibold">{formatYm(row.month)}은 정산 전입니다.</span>{" "}
            <span className="text-muted-foreground">입금·지출·저축은 계획을 보여 주고, 정산을 마치면 실제 값으로 바뀝니다.</span>
          </p>
          <Button asChild variant="secondary" className="shrink-0">
            <Link href="/settlement">정산하러 가기</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <FlowCard
          summary={summary}
          settled={settled}
          memberName={(id) => pocketName(data, id)}
          memberTone={(id) => pocketTone(data, id)}
        />
        <SpendingCard summary={summary} settled={settled} />
        <BalanceCard summary={summary} />
        <HistoryCard rows={rows} selected={row.month} onSelect={setSelected} />
      </div>
    </PageContainer>
  );
}

// ───────────────────────── 흐름: 공동저축 ─────────────────────────

function FlowCard({
  summary,
  settled,
  memberName,
  memberTone,
}: {
  summary: JointMonthSummary;
  settled: boolean;
  memberName: (id: string) => string;
  memberTone: (id: string) => PocketTone;
}) {
  const { flows, plan } = summary;
  if (!flows) {
    return (
      <Card className="lg:col-span-3">
        <EmptyState
          title="기준 월입니다"
          description="첫 달은 비교할 지난 잔액이 없어 잔액만 기록합니다. 다음 달부터 입금·지출·저축을 계산합니다."
        />
      </Card>
    );
  }
  const pending = <span className="text-caption font-medium text-warning-foreground">정산 전</span>;
  const otherPlanned = plan.inflow - summary.plannedContributions;

  return (
    <Card className="lg:col-span-3">
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-10">
        <Stat
          size="lg"
          label={settled ? "공동저축" : "공동저축 계획"}
          info={<InfoTip title="공동저축">{TIPS.savings}</InfoTip>}
          value={<Money amount={settled ? flows.savings : plan.savings} />}
          sub={
            settled ? (
              <>
                계획 <Money amount={plan.savings} />
              </>
            ) : (
              "정산을 마치면 실제 금액이 보입니다"
            )
          }
        />

        <div className="flex flex-col gap-3">
          <table className="w-full text-sm">
            <caption className="sr-only">공용통장 흐름 계획과 실제</caption>
            <thead>
              <tr className="border-b text-caption text-muted-foreground">
                <th scope="col" className="pb-2 text-left font-medium">
                  항목
                </th>
                <th scope="col" className="w-[30%] pb-2 text-right font-medium">
                  계획
                </th>
                <th scope="col" className="w-[30%] pb-2 text-right font-medium">
                  실제
                </th>
              </tr>
            </thead>
            <tbody className="[&_tr]:border-b [&_tr:last-child]:border-0">
              {summary.contributions.map((contribution) => (
                <FlowRow
                  key={contribution.pocket}
                  label={
                    <PocketBadge tone={memberTone(contribution.pocket)} className="text-sm font-normal">
                      {memberName(contribution.pocket)} 입금
                    </PocketBadge>
                  }
                  planned={<Money amount={contribution.planned} />}
                  actual={<Money amount={contribution.actual} />}
                />
              ))}
              {(otherPlanned !== 0 || flows.otherInflow !== 0) && (
                <FlowRow
                  label="그 밖에 들어온 돈"
                  planned={<Money amount={otherPlanned} />}
                  actual={settled ? <Money amount={flows.otherInflow} /> : pending}
                />
              )}
              <FlowRow
                label={
                  <>
                    공동생활비 <InfoTip title="공동생활비">{TIPS.consumption}</InfoTip>
                  </>
                }
                planned={<Money amount={plan.consumption} />}
                actual={settled ? <Money amount={flows.consumption} /> : pending}
              />
              {(plan.principal !== 0 || flows.principalPaid !== 0) && (
                <FlowRow
                  label="공동 부채 원금 상환"
                  planned={<Money amount={plan.principal} />}
                  actual={settled ? <Money amount={flows.principalPaid} /> : pending}
                />
              )}
              <FlowRow
                label={
                  <>
                    다른 계좌로 이동 <InfoTip title="다른 계좌로 이동">{TIPS.movedOut}</InfoTip>
                  </>
                }
                planned={<Money amount={plan.designatedSavings} />}
                actual={settled ? <Money amount={flows.movedOut} /> : pending}
                note={
                  settled && flows.transfersOut > 0 ? (
                    <>
                      개인 주머니로 보낸 <Money amount={flows.transfersOut} /> 포함
                    </>
                  ) : undefined
                }
              />
            </tbody>
          </table>
          <p className="text-caption text-muted-foreground">
            공용통장 입금과 적금 이체는 소비가 아니라 자금 이동입니다. 다른 공동 자산으로 옮긴 돈은 공동저축에 들어갑니다.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function FlowRow({ label, planned, actual, note }: { label: ReactNode; planned: ReactNode; actual: ReactNode; note?: ReactNode }) {
  return (
    <tr>
      <th scope="row" className="py-2.5 text-left font-normal">
        <span className="flex items-center gap-1">{label}</span>
        {note && <span className="block text-caption text-muted-foreground">{note}</span>}
      </th>
      <td className="py-2.5 text-right text-muted-foreground">{planned}</td>
      <td className="py-2.5 text-right font-semibold">{actual}</td>
    </tr>
  );
}

// ───────────────────────── 공동생활비 ─────────────────────────

function SpendingCard({ summary, settled }: { summary: JointMonthSummary; settled: boolean }) {
  const { flows } = summary;
  if (!flows) return null;
  const budget = flows.plannedConsumption;
  const usedPercent = settled ? percentOf(flows.consumption, budget) : null;
  const over = usedPercent !== null && usedPercent > 100;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-1">
          공동생활비 <InfoTip title="공동생활비">{TIPS.consumption}</InfoTip>
        </CardTitle>
        <CardDescription>예산과 실제</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            {settled ? (
              <Money amount={flows.consumption} className="num-display text-2xl font-bold" />
            ) : (
              <span className="num-display text-2xl font-bold text-muted-foreground">정산 전</span>
            )}
            <span className="flex items-center gap-2 text-sm whitespace-nowrap text-muted-foreground">
              {over && <Badge variant="warning">예산 초과</Badge>}
              예산 <Money amount={budget} className="font-medium text-foreground" />
            </span>
          </div>
          <Progress value={usedPercent} tone={over ? "warning" : "joint"} aria-label="공동생활비 예산 사용률" />
          {settled && (
            <dl className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-caption text-muted-foreground">
              <div className="flex items-center gap-1">
                <dt>확인된 지출</dt>
                <dd>
                  <Money amount={flows.classified} className="font-medium text-foreground" />
                </dd>
              </div>
              <div className="flex items-center gap-1">
                <dt className="flex items-center gap-0.5">
                  미분류 <InfoTip title="미분류 지출">{TIPS.unclassified}</InfoTip>
                </dt>
                <dd>
                  <Money
                    amount={flows.unclassified}
                    className={cn("font-medium text-foreground", flows.unclassified < 0 && "text-warning-foreground")}
                  />
                </dd>
              </div>
              {usedPercent !== null && <span className="tabular-nums">예산의 {formatPercent(usedPercent)}</span>}
            </dl>
          )}
        </div>

        {flows.expenseLines.length > 0 && (
          <div className="flex flex-col gap-3">
            <table className="w-full text-sm">
              <caption className="sr-only">주요 공동지출 계획과 실제</caption>
              <thead>
                <tr className="border-b text-caption text-muted-foreground">
                  <th scope="col" className="pb-2 text-left font-medium">
                    주요 공동지출
                  </th>
                  <th scope="col" className="w-[30%] pb-2 text-right font-medium">
                    계획
                  </th>
                  <th scope="col" className="w-[30%] pb-2 text-right font-medium">
                    실제
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr]:border-b [&_tr:last-child]:border-0">
                {flows.expenseLines.map((line) => (
                  <tr key={line.key}>
                    <th scope="row" className="py-2.5 text-left font-normal">
                      {line.name}
                      {line.planned === null && <span className="ml-1.5 text-caption text-muted-foreground">추가</span>}
                    </th>
                    <td className="py-2.5 text-right text-muted-foreground">
                      <Money amount={line.planned} />
                    </td>
                    <td className="py-2.5 text-right font-semibold">
                      <Money amount={line.actual} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {flows.expenseLines.some((line) => line.actual === null) && (
              <p className="text-caption text-muted-foreground">
                실제 칸의 —는 금액을 따로 확인하지 않은 항목입니다. 그 돈은 미분류에 들어갑니다.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────────────────── 잔액 ─────────────────────────

function BalanceCard({ summary }: { summary: JointMonthSummary }) {
  if (summary.accounts.length === 0) {
    return (
      <Card>
        <EmptyState
          title="공용통장이 없어요"
          description="공동 소유 입출금 통장을 자산에 등록하면 잔액 변화를 볼 수 있습니다."
          action={
            <Button asChild variant="secondary">
              <Link href="/assets">자산 등록</Link>
            </Button>
          }
        />
      </Card>
    );
  }
  const change = summary.closingBalance === null ? null : summary.closingBalance - summary.openingBalance;
  return (
    <Card>
      <CardContent className="flex flex-1 flex-col gap-5">
        <Stat
          label={`${formatMonthOnly(summary.month)} 말 공용통장 잔액`}
          info={<InfoTip title="공용통장 잔액">{TIPS.balance}</InfoTip>}
          value={<Money amount={summary.closingBalance} />}
          sub={
            summary.closingBalance === null ? (
              "잔액 미확인"
            ) : summary.isBaseline ? (
              "기준 월 잔액"
            ) : (
              <>
                월초 <Money amount={summary.openingBalance} /> <Delta amount={change} />
              </>
            )
          }
        />
        {summary.accounts.length > 1 && (
          <ul className="flex flex-col gap-2 border-t pt-4 text-sm">
            {summary.accounts.map((account) => (
              <li key={account.assetId} className="flex items-center justify-between gap-3">
                <span className="truncate text-muted-foreground">{account.name}</span>
                <Money amount={account.closing} className="font-medium" />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-auto border-t pt-4 text-caption text-muted-foreground">
          <span className="font-medium text-foreground">입금은 소비가 아닙니다.</span> 개인 통장에서 공용통장으로 옮긴 돈은 위치만
          바뀝니다. <InfoTip title="공용통장 입금">{TIPS.contribution}</InfoTip>
        </p>
      </CardContent>
    </Card>
  );
}

// ───────────────────────── 최근 6개월 ─────────────────────────

function HistoryCard({ rows, selected, onSelect }: { rows: JointHistoryRow[]; selected: Ym; onSelect: (month: Ym) => void }) {
  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle>최근 {rows.length}개월</CardTitle>
        <CardDescription>정산을 마친 달만 입금·생활비·저축을 보여 줍니다</CardDescription>
      </CardHeader>
      <CardContent>
        <table className="w-full table-fixed text-caption sm:text-sm">
          <caption className="sr-only">최근 공용통장 입금, 공동생활비, 공동저축, 월말 잔액</caption>
          <thead>
            <tr className="border-b text-muted-foreground">
              <th scope="col" className="w-14 pb-2 text-left font-medium">
                월
              </th>
              {/* 좁은 화면에서는 입금 열을 숨긴다 (선택한 달의 입금은 위 표에 있다) */}
              <th scope="col" className="hidden pb-2 text-right font-medium sm:table-cell">
                입금
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                공동생활비
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                공동저축
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                월말 잔액
              </th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((row) => {
              const active = row.month === selected;
              return (
                <tr key={row.month} className={cn("border-b last:border-0", active && "bg-accent")}>
                  <th scope="row" className="p-0 text-left font-medium">
                    <button
                      type="button"
                      onClick={() => onSelect(row.month)}
                      aria-current={active ? "true" : undefined}
                      aria-label={`${formatYm(row.month)} 보기`}
                      className="flex h-11 w-full items-center rounded-md pl-1.5 tabular-nums outline-none hover:text-brand focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    >
                      {formatYmShort(row.month)}
                    </button>
                  </th>
                  <td className="hidden pl-2 text-right sm:table-cell">
                    <Money amount={row.contributions} compact />
                  </td>
                  <td className="pl-2 text-right">
                    <Money amount={row.consumption} compact />
                  </td>
                  <td className="pl-2 text-right">
                    <Money amount={row.savings} compact />
                  </td>
                  <td className="pr-1.5 pl-2 text-right font-medium">
                    <Money amount={row.closingBalance} compact />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
