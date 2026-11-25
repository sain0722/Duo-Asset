"use client";

import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { InfoTip } from "@/components/info-tip";
import { Money } from "@/components/money";
import { MonthSwitcher } from "@/components/month-switcher";
import { PageContainer, PageHeader } from "@/components/page";
import { PocketBadge } from "@/components/pocket-badge";
import { SectionTabs } from "@/components/section-tabs";
import { SECTION_TABS } from "@/components/shell/nav";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { findMonth, latestMonth, planForMonth, pocketName, pocketTone } from "@/lib/data/derive";
import { useHousehold } from "@/lib/data/hooks";
import type { HouseholdData } from "@/lib/data/types";
import { percentOf } from "@/lib/finance";
import { INCOME_TYPE_LABELS } from "@/lib/finance/meta";
import type { JointPlan, MemberPlan, MonthPlan, PlanItem, PlanItemKind, PlanLine, PocketId, Ym } from "@/lib/finance/types";
import { JOINT } from "@/lib/finance/types";
import { formatPercent, formatWon } from "@/lib/format";
import { addMonths, compareYm, currentYm } from "@/lib/month";
import { cn } from "@/lib/utils";

import { AllocationBar, SEGMENT_COLORS, SegmentDot, type BarSegment } from "./allocation-bar";
import { PlanItemDialog, type PlanItemDialogTarget } from "./plan-item-dialog";
import { inactiveReason, monthsLabel, periodLabel } from "./plan-items";

const FUTURE_MONTHS = 60;

export function PlanView() {
  const data = useHousehold();
  const thisMonth = currentYm();
  const [month, setMonth] = useState<Ym>(thisMonth);
  const [dialog, setDialog] = useState<{ target: PlanItemDialogTarget; key: number } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const plan = planForMonth(data, month);
  const row = findMonth(data, month);
  // 한 번 마감했던 달은 그때 동결한 계획을 쓴다: 항목을 고쳐도 바뀌지 않으므로 줄을 눌러 고치지 않게 한다
  const frozen = row?.summary != null;
  const firstMonth = data.months[0]?.month;
  const latest = latestMonth(data)?.month;
  const min = firstMonth && compareYm(firstMonth, thisMonth) < 0 ? firstMonth : thisMonth;

  function openDialog(target: PlanItemDialogTarget) {
    setDialog({ target, key: Date.now() });
    setDialogOpen(true);
  }
  const itemById = new Map(data.planItems.map((item) => [item.id, item]));
  const edit = frozen
    ? undefined
    : (line: PlanLine) => {
        const item = line.planItemId ? itemById.get(line.planItemId) : undefined;
        if (item) openDialog({ item });
      };
  const add = (pocket: PocketId, kind: PlanItemKind) => openDialog({ item: null, pocket, kind });

  const status = row
    ? row.status === "closed"
      ? { badge: <Badge>마감</Badge>, note: "마감할 때 동결한 계획입니다. 항목을 고쳐도 이 달은 바뀌지 않습니다." }
      : frozen
        ? { badge: <Badge variant="warning">다시 연 달</Badge>, note: "다시 연 달은 마감 당시의 계획을 그대로 씁니다." }
        : { badge: <Badge variant="brand">정산 중</Badge>, note: null }
    : latest && compareYm(month, latest) > 0
      ? { badge: <Badge variant="outline">예상</Badge>, note: "현재 설정과 예정된 상환 일정으로 계산한 계획입니다." }
      : { badge: null, note: null };

  return (
    <PageContainer>
      <PageHeader
        title="월급·배분"
        description="월급이 어디로 가는지, 각자 쓸 수 있는 돈이 얼마인지 봅니다."
        actions={
          <Button onClick={() => add(data.me.id, "income")}>
            <Plus aria-hidden />
            항목 추가
          </Button>
        }
      />
      <SectionTabs items={SECTION_TABS.plan} aria-label="월급 메뉴" />

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <MonthSwitcher value={month} onChange={setMonth} min={min} max={addMonths(thisMonth, FUTURE_MONTHS)} className="-ml-2.5" />
          {status.badge}
          {month !== thisMonth && (
            <Button variant="link" size="sm" className="ml-auto text-sm" onClick={() => setMonth(thisMonth)}>
              이번 달
            </Button>
          )}
        </div>
        {status.note && <p className="text-caption text-muted-foreground">{status.note}</p>}
      </div>

      <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
        <SummaryCard plan={plan} />
        {plan.members.map((memberPlan) => (
          <MemberCard key={memberPlan.memberId} data={data} plan={memberPlan} itemById={itemById} onEdit={edit} onAdd={add} />
        ))}
        <JointCard data={data} plan={plan} itemById={itemById} onEdit={edit} onAdd={add} />
        <UnusedCard data={data} plan={plan} month={month} onEdit={(item) => openDialog({ item })} />
      </div>

      {dialog && (
        <PlanItemDialog key={dialog.key} open={dialogOpen} onOpenChange={setDialogOpen} target={dialog.target} viewedMonth={month} />
      )}
    </PageContainer>
  );
}

// ───────────────────────── 가구 합계 ─────────────────────────

function SummaryCard({ plan }: { plan: MonthPlan }) {
  const { totals } = plan;
  const savingsRate = percentOf(totals.savings, totals.income);
  const parts = [
    {
      key: "consumption",
      label: "계획 소비",
      amount: totals.consumption,
      className: SEGMENT_COLORS.spend,
      info: "개인 고정지출, 대출 이자, 개인 사용 가능 금액(음수는 0), 공동지출의 합입니다. 개인 사용 가능 금액은 쓰는 돈으로 봅니다. 쓰고 남기면 실제 저축이 계획을 넘습니다.",
    },
    {
      key: "savings",
      label: "계획 저축",
      amount: totals.savings,
      className: SEGMENT_COLORS.saving,
      info: "수입 − 계획 소비 − 계획 원금상환입니다. 개인 저축 항목과 공동저축이 여기에 들어갑니다.",
    },
    {
      key: "principal",
      label: "원금 상환",
      amount: totals.principalRepayment,
      className: SEGMENT_COLORS.debt,
      info: "부채 일정에서 계산한 이 달의 원금입니다. 순자산을 그대로 둔 채 부채를 줄이는 돈이라 저축과 따로 봅니다.",
    },
  ];

  return (
    <Card className="lg:col-span-3">
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-end lg:gap-10">
        <Stat
          size="lg"
          label="합산 월수입"
          info={
            <InfoTip title="합산 월수입">
              두 사람이 이 달에 받을 현금 수입의 합입니다. 비현금 복지(식비 카드 등)는 포함하지 않습니다.
            </InfoTip>
          }
          value={<Money amount={totals.income} />}
          sub={totals.benefits > 0 ? <>비현금 복지 <Money amount={totals.benefits} /> 별도</> : undefined}
        />
        <div className="flex flex-col gap-4">
          <AllocationBar
            label="수입 = 계획 소비 + 계획 저축 + 원금 상환"
            segments={parts.map(({ key, label, amount, className }) => ({ key, label, amount, className }))}
            className="h-3"
          />
          <dl className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            {parts.map((part) => (
              <div key={part.key} className="flex items-baseline justify-between gap-3 sm:flex-col sm:items-start sm:gap-1">
                <dt className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <SegmentDot className={part.className} />
                  {part.label}
                  <InfoTip title={part.label}>{part.info}</InfoTip>
                </dt>
                <dd className="flex items-baseline gap-1.5 text-right sm:text-left">
                  <Money amount={part.amount} className={cn("text-base font-semibold sm:text-lg", part.amount < 0 && "text-warning-foreground")} />
                  {part.key === "savings" && savingsRate !== null && (
                    <span className="text-caption text-muted-foreground tabular-nums">{formatPercent(savingsRate)}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {totals.savings < 0 && (
            <p className="text-caption text-warning-foreground">수입보다 많이 쓰거나 갚는 계획입니다. 항목을 확인해 주세요.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ───────────────────────── 구성원 ─────────────────────────

type LineHandlers = {
  data: HouseholdData;
  itemById: Map<string, PlanItem>;
  onEdit?: (line: PlanLine) => void;
  onAdd: (pocket: PocketId, kind: PlanItemKind) => void;
};

function MemberCard({ data, plan, itemById, onEdit, onAdd }: LineHandlers & { plan: MemberPlan }) {
  const tone = pocketTone(data, plan.memberId);
  const name = pocketName(data, plan.memberId);
  const of = (kind: PlanLine["kind"]) => plan.lines.filter((line) => line.kind === kind);
  const groups: { key: string; label: string; total: number; className: string; lines: PlanLine[] }[] = [
    { key: "expense", label: "고정지출", total: plan.fixedExpenses, className: SEGMENT_COLORS.spend, lines: of("expense") },
    { key: "debt", label: "부채 상환", total: plan.debtPrincipal + plan.debtInterest, className: SEGMENT_COLORS.debt, lines: of("debt") },
    { key: "contribution", label: "공용통장 납입", total: plan.contribution, className: SEGMENT_COLORS.contribution, lines: of("contribution") },
    { key: "saving", label: "저축", total: plan.savings, className: SEGMENT_COLORS.saving, lines: of("saving") },
  ];
  const segments: BarSegment[] = [
    ...groups.map(({ key, label, total, className }) => ({ key, label, amount: total, className })),
    { key: "allowance", label: "사용 가능", amount: plan.allowance, className: SEGMENT_COLORS[tone] },
  ];
  const over = plan.allowance < 0;
  const empty = plan.lines.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <PocketBadge tone={tone} className="text-base font-semibold">
            {name}
            {plan.memberId === data.me.id && <span className="ml-1.5 text-caption font-normal text-muted-foreground">나</span>}
          </PocketBadge>
        </CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" className="-mr-2" onClick={() => onAdd(plan.memberId, plan.income > 0 ? "expense" : "income")}>
            <Plus aria-hidden />
            추가
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {empty ? (
          <EmptyHint onAdd={() => onAdd(plan.memberId, "income")}>급여부터 적으면 쓸 수 있는 돈을 계산해 드려요.</EmptyHint>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <Stat
                label="개인 사용 가능 금액"
                info={
                  <InfoTip title="개인 사용 가능 금액">
                    현금 수입 − 개인 고정지출 − 개인 부채 상환(원금+이자) − 공용통장 납입 − 개인 저축입니다. 생활비와 추가 저축에 쓰는 돈입니다.
                  </InfoTip>
                }
                value={<Money amount={plan.allowance} className={cn(over && "text-warning-foreground")} />}
                sub={
                  over ? (
                    <span className="text-warning-foreground">수입보다 <Money amount={-plan.allowance} />을 더 배분했습니다</span>
                  ) : (
                    <>
                      수입 <Money amount={plan.income} /> 중
                    </>
                  )
                }
              />
              <AllocationBar label={`${name} 수입 배분`} segments={segments} />
            </div>

            <div className="flex flex-col gap-4">
              <LineGroup label="수입" total={plan.income} lines={of("income")} itemById={itemById} onEdit={onEdit} />
              {groups.map((group) =>
                group.lines.length ? (
                  <LineGroup
                    key={group.key}
                    label={group.label}
                    total={group.total}
                    dotClassName={group.className}
                    lines={group.lines}
                    itemById={itemById}
                    onEdit={onEdit}
                    data={data}
                  />
                ) : null,
              )}
              {plan.benefits > 0 && (
                <LineGroup
                  label="비현금 복지"
                  hint="현금 수입에 포함되지 않음"
                  total={plan.benefits}
                  lines={of("benefit")}
                  itemById={itemById}
                  onEdit={onEdit}
                  muted
                />
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────────────────── 공동 ─────────────────────────

function JointCard({ data, plan, itemById, onEdit, onAdd }: LineHandlers & { plan: MonthPlan }) {
  const joint: JointPlan = plan.joint;
  const of = (kind: PlanLine["kind"]) => joint.lines.filter((line) => line.kind === kind);
  const contributionLines = plan.members.flatMap((member) => member.lines.filter((line) => line.kind === "contribution"));
  const debtTotal = joint.debtPrincipal + joint.debtInterest;
  const empty = joint.lines.length === 0 && contributionLines.length === 0;
  const short = joint.surplus < 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <PocketBadge tone="joint" className="text-base font-semibold">
            공동
          </PocketBadge>
        </CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" className="-mr-2" onClick={() => onAdd(JOINT, "expense")}>
            <Plus aria-hidden />
            추가
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {empty ? (
          <EmptyHint onAdd={() => onAdd(JOINT, "expense")}>공용통장에서 나가는 주거비·생활비를 적어 주세요.</EmptyHint>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <Stat
                label="공동저축"
                info={
                  <InfoTip title="공동저축">
                    구성원 납입 합 + 공동 수입 − 공동지출 − 공동 부채 상환(원금+이자)입니다. 공용통장에서 다른 공동 자산으로 옮기기로 한 금액은 공동저축의 일부입니다.
                  </InfoTip>
                }
                value={<Money amount={joint.surplus} className={cn(short && "text-warning-foreground")} />}
                sub={
                  short ? (
                    <span className="text-warning-foreground">납입보다 공동지출이 많습니다</span>
                  ) : joint.designatedSavings > 0 ? (
                    <>
                      그중 다른 자산으로 <Money amount={joint.designatedSavings} />
                    </>
                  ) : (
                    "공용통장에 남는 돈"
                  )
                }
              />
              <AllocationBar
                label="공동 자금 배분"
                segments={[
                  { key: "expense", label: "공동지출", amount: joint.expenses, className: SEGMENT_COLORS.spend },
                  { key: "debt", label: "공동 부채 상환", amount: debtTotal, className: SEGMENT_COLORS.debt },
                  { key: "designated", label: "지정 저축", amount: joint.designatedSavings, className: SEGMENT_COLORS.saving },
                  { key: "rest", label: "공용통장에 남는 돈", amount: joint.surplus - joint.designatedSavings, className: SEGMENT_COLORS.joint },
                ]}
              />
            </div>

            <div className="flex flex-col gap-4">
              <LineGroup
                label="들어오는 돈"
                hint="공용통장 납입은 소비가 아니라 주머니 사이 이동입니다"
                total={joint.contributions + joint.income}
                lines={[...contributionLines, ...of("income")]}
                itemById={itemById}
                onEdit={onEdit}
                data={data}
                showPocket
              />
              {joint.expenses > 0 && (
                <LineGroup label="공동지출" total={joint.expenses} dotClassName={SEGMENT_COLORS.spend} lines={of("expense")} itemById={itemById} onEdit={onEdit} />
              )}
              {debtTotal > 0 && (
                <LineGroup label="공동 부채 상환" total={debtTotal} dotClassName={SEGMENT_COLORS.debt} lines={of("debt")} itemById={itemById} onEdit={onEdit} data={data} />
              )}
              {joint.designatedSavings > 0 && (
                <LineGroup
                  label="지정 저축"
                  hint="공동저축의 일부"
                  total={joint.designatedSavings}
                  dotClassName={SEGMENT_COLORS.saving}
                  lines={of("saving")}
                  itemById={itemById}
                  onEdit={onEdit}
                  data={data}
                />
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────────────────── 줄 목록 ─────────────────────────

function LineGroup({
  label,
  hint,
  total,
  dotClassName,
  lines,
  itemById,
  onEdit,
  data,
  showPocket = false,
  muted = false,
}: {
  label: string;
  hint?: string;
  total: number;
  dotClassName?: string;
  lines: PlanLine[];
  itemById: Map<string, PlanItem>;
  onEdit?: (line: PlanLine) => void;
  data?: HouseholdData;
  showPocket?: boolean;
  muted?: boolean;
}) {
  return (
    <section className="flex flex-col">
      <div className="border-b pb-2">
        <h4 className="flex items-center justify-between gap-3 text-sm">
          <span className="flex min-w-0 items-center gap-1.5 font-medium text-muted-foreground">
            {dotClassName && <SegmentDot className={dotClassName} />}
            <span className="truncate">{label}</span>
          </span>
          <Money amount={total} className={cn("font-semibold", muted && "text-muted-foreground")} />
        </h4>
        {hint && <p className={cn("text-caption text-muted-foreground", dotClassName && "pl-3.5")}>{hint}</p>}
      </div>
      <ul className="flex flex-col">
        {lines.map((line) => (
          <li key={line.key}>
            <LineRow line={line} item={line.planItemId ? itemById.get(line.planItemId) : undefined} onEdit={onEdit} data={data} showPocket={showPocket} muted={muted} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LineRow({
  line,
  item,
  onEdit,
  data,
  showPocket,
  muted,
}: {
  line: PlanLine;
  item?: PlanItem;
  onEdit?: (line: PlanLine) => void;
  data?: HouseholdData;
  showPocket: boolean;
  muted: boolean;
}) {
  const meta = lineMeta(line, item, data, showPocket);
  const body = (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          {showPocket && data ? (
            <PocketBadge tone={pocketTone(data, line.pocket)} className="text-body font-normal">
              {line.kind === "contribution" ? pocketName(data, line.pocket) : line.name}
            </PocketBadge>
          ) : (
            <span className="truncate text-body">{line.name}</span>
          )}
        </span>
        {meta && <span className="truncate text-caption text-muted-foreground">{meta}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <Money amount={line.amount} className={cn("text-body", muted && "text-muted-foreground")} />
        {line.kind === "debt" && <ChevronRight aria-hidden className="size-4 text-muted-foreground" />}
      </span>
    </>
  );
  const rowClassName = "-mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-2 text-left";
  const interactive = "transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40";

  // 부채 상환은 부채에서 계산되므로 여기서 고치지 않고 부채 화면으로 보낸다
  if (line.kind === "debt") {
    return (
      <Link href="/liabilities" className={cn(rowClassName, interactive)} aria-label={`${line.name} 부채 상환, 부채 화면에서 보기`}>
        {body}
      </Link>
    );
  }
  if (!onEdit || !item) return <div className={rowClassName}>{body}</div>;
  return (
    <button type="button" className={cn(rowClassName, interactive)} onClick={() => onEdit(line)}>
      {body}
    </button>
  );
}

function lineMeta(line: PlanLine, item: PlanItem | undefined, data: HouseholdData | undefined, showPocket: boolean): string | null {
  const parts: string[] = [];
  if (line.kind === "debt") {
    parts.push(`원금 ${formatWon(line.principal ?? 0)} · 이자 ${formatWon(line.interest ?? 0)}`);
  }
  // 공동 카드에서는 줄 이름 자리에 납입한 사람을 보여 주므로 항목 이름을 보조 줄로 내린다
  if (showPocket && line.kind === "contribution") parts.push(line.name);
  if (line.kind === "income" && line.incomeType) parts.push(INCOME_TYPE_LABELS[line.incomeType]);
  if (line.payDay) parts.push(`매월 ${line.payDay}일`);
  if (item?.months_of_year) parts.push(`${monthsLabel(item.months_of_year)}만`);
  if (item) {
    const period = periodLabel(item);
    if (period) parts.push(period);
  }
  if (line.kind === "saving" && line.assetId && data) {
    const asset = data.assets.find((a) => a.id === line.assetId);
    if (asset) parts.push(`→ ${asset.name}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

// ───────────────────────── 이 달에 빠진 항목 ─────────────────────────

function UnusedCard({ data, plan, month, onEdit }: { data: HouseholdData; plan: MonthPlan; month: Ym; onEdit: (item: PlanItem) => void }) {
  const used = new Set(plan.lines.map((line) => line.planItemId).filter(Boolean));
  const unused = data.planItems
    .filter((item) => !used.has(item.id))
    .sort((a, b) => a.sort_order - b.sort_order);
  if (unused.length === 0) return null;

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle>이 달에 빠진 항목</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
          {unused.map((item) => {
            const pocket = item.member_id ?? JOINT;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="-mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <span className="flex min-w-0 flex-col">
                    <PocketBadge tone={pocketTone(data, pocket)} className="text-body font-normal">
                      {item.name}
                    </PocketBadge>
                    <span className="truncate pl-3.5 text-caption text-muted-foreground">
                      {inactiveReason(item, month) ?? "마감 당시 계획에 없음"}
                    </span>
                  </span>
                  <Money amount={item.amount} className="text-body text-muted-foreground" />
                </button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function EmptyHint({ children, onAdd }: { children: ReactNode; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 py-2">
      <p className="text-sm text-muted-foreground">{children}</p>
      <Button variant="secondary" onClick={onAdd}>
        <Plus aria-hidden />
        항목 추가
      </Button>
    </div>
  );
}
