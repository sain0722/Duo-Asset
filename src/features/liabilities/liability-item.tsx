"use client";

import { Archive, ArchiveRestore, CircleCheck, Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Money } from "@/components/money";
import { PocketBadge } from "@/components/pocket-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { history, latestMonth, pocketName, pocketTone } from "@/lib/data/derive";
import { useHousehold, useMutate } from "@/lib/data/hooks";
import { clearSnapshotOrEntry, deleteRow, saveLiabilitySnapshot, updateRow } from "@/lib/data/mutations";
import { EMPTY_MONTH_DATA } from "@/lib/data/types";
import { LIABILITY_KINDS, pocketOf } from "@/lib/finance/meta";
import type { Liability, LiabilityLine, PlanLine, Ym } from "@/lib/finance/types";
import { formatCompactWon, formatMonthOnly, formatYm, formatYmShort } from "@/lib/format";
import { cn } from "@/lib/utils";

import { liabilityHistory, repaidPercent, type PayoffInfo } from "./derive";
import { LiabilityBalanceDialog } from "./liability-balance-dialog";
import { LiabilityFormDialog } from "./liability-form-dialog";

export interface LiabilityItemModel {
  liability: Liability;
  /** 가장 최근 달의 부채 줄. 집계에서 빠진(보관 후 0원) 부채는 null */
  line: LiabilityLine | null;
  /** 가장 최근 달 계획의 상환 줄 */
  planned: PlanLine | null;
  payoff: PayoffInfo | null;
}

type Dialog = "edit" | "balance" | "payoff" | "delete" | null;

const SCHEDULE_PREVIEW = 12;

/** 부채 한 줄. 누르면 펼쳐져 일정표·예정 vs 실제·동작이 나온다. */
export function LiabilityItem({ model, asOf }: { model: LiabilityItemModel; asOf: Ym }) {
  const data = useHousehold();
  const { liability, line, planned, payoff } = model;
  const [expanded, setExpanded] = useState(false);
  const pocket = pocketOf(liability.payer_member_id);
  const balance = line?.balance ?? null;
  const noPrincipal = liability.kind === "interest_only";
  const firstPayment = payoff?.schedule.find((row) => row.payment > 0) ?? null;
  // 이번 달 예정액이 있으면 그것, 아직 시작 전이면 첫 납부
  const monthly = planned && planned.amount > 0 ? { month: asOf, principal: planned.principal ?? 0, interest: planned.interest ?? 0, payment: planned.amount } : firstPayment;
  const detailId = `liability-${liability.id}`;

  return (
    <li className="py-1">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => setExpanded((value) => !value)}
        className="-mx-2 flex w-[calc(100%+1rem)] flex-col gap-3 rounded-xl px-2 py-3 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-body font-medium">{liability.name}</span>
            <span className="flex min-w-0 items-center gap-2 text-caption text-muted-foreground">
              <PocketBadge tone={pocketTone(data, pocket)} className="text-caption font-normal">
                {pocket === "joint" ? "공용통장" : pocketName(data, pocket)}
              </PocketBadge>
              <span className="truncate">{LIABILITY_KINDS[liability.kind].label}</span>
            </span>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Money amount={balance} className="text-body font-semibold" />
            {line && !line.confirmed ? (
              <span className="text-caption text-muted-foreground">지난달 값</span>
            ) : (
              !noPrincipal && (
                <span className="text-caption text-muted-foreground">
                  / <Money amount={liability.original_principal} compact />
                </span>
              )
            )}
          </div>
        </div>

        {!noPrincipal && balance !== null && (
          <Progress
            value={repaidPercent(liability.original_principal, balance)}
            tone="ink"
            aria-label={`${liability.name} 상환 진행률`}
          />
        )}

        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-caption text-muted-foreground">
          {noPrincipal ? (
            <span>
              원금 상환 없음 · 매월 <Money amount={monthly?.payment ?? null} compact className="font-medium text-foreground" /> 지급
            </span>
          ) : monthly ? (
            <span>
              {monthly.month === asOf ? "매월" : `${formatYm(monthly.month)}부터 매월`}{" "}
              <Money amount={monthly.payment} compact className="font-medium text-foreground" />
              {monthly.interest > 0 && <> (이자 {formatCompactWon(monthly.interest)})</>}
            </span>
          ) : (
            <span>{balance === 0 ? "다 갚았어요" : "예정된 납부 없음"}</span>
          )}
          {payoff?.endMonth && (
            <span>
              {formatYm(payoff.endMonth)} 완납 →{" "}
              <span className="font-medium text-foreground">매월 +{formatCompactWon(payoff.freed)}</span>
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div id={detailId} className="flex flex-col gap-4 pt-2 pb-4">
          <LiabilityActions model={model} />
          <Tabs defaultValue="schedule">
            <TabsList>
              <TabsTrigger value="schedule">상환 일정</TabsTrigger>
              <TabsTrigger value="actual">예정 vs 실제</TabsTrigger>
            </TabsList>
            <TabsContent value="schedule">
              <ScheduleTable model={model} />
            </TabsContent>
            <TabsContent value="actual">
              <ActualTable liability={liability} />
            </TabsContent>
          </Tabs>
          <Details liability={liability} />
        </div>
      )}
    </li>
  );
}

function Details({ liability }: { liability: Liability }) {
  const data = useHousehold();
  const account = data.assets.find((asset) => asset.id === liability.withdraw_asset_id);
  const parts = [
    liability.annual_rate > 0 && `연 ${liability.annual_rate}%`,
    liability.term_months && `${liability.term_months}개월`,
    liability.start_month && `첫 납부 ${formatYm(liability.start_month)}`,
    liability.payment_day && `매월 ${liability.payment_day}일`,
    account && `${account.name}에서 출금`,
  ].filter(Boolean);
  if (parts.length === 0 && !liability.memo) return null;
  return (
    <div className="flex flex-col gap-1 text-caption text-muted-foreground">
      {parts.length > 0 && <p>{parts.join(" · ")}</p>}
      {liability.memo && <p className="whitespace-pre-line">{liability.memo}</p>}
    </div>
  );
}

const th = "py-2 text-right text-caption font-medium text-muted-foreground";
const td = "py-2 text-right tabular-nums";

function ScheduleTable({ model }: { model: LiabilityItemModel }) {
  const [all, setAll] = useState(false);
  const { liability, payoff } = model;
  if (liability.kind === "interest_only") {
    return <p className="text-sm text-muted-foreground">원금 상환 계획이 없어 매월 정해진 금액만 지급합니다.</p>;
  }
  const rows = (payoff?.schedule ?? []).filter((row) => row.payment > 0);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">남은 납부 일정이 없어요.</p>;
  const shown = all ? rows : rows.slice(0, SCHEDULE_PREVIEW);
  const hasInterest = rows.some((row) => row.interest > 0);

  return (
    <div className="flex flex-col gap-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th scope="col" className={cn(th, "text-left")}>
              월
            </th>
            <th scope="col" className={th}>
              원금
            </th>
            {hasInterest && (
              <th scope="col" className={th}>
                이자
              </th>
            )}
            {hasInterest && (
              <th scope="col" className={cn(th, "hidden sm:table-cell")}>
                납부액
              </th>
            )}
            <th scope="col" className={th}>
              잔액
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {shown.map((row) => (
            <tr key={row.month}>
              <th scope="row" className="py-2 text-left font-normal tabular-nums">
                {formatYmShort(row.month)}
              </th>
              <td className={td}>
                <Money amount={row.principal} compact />
              </td>
              {hasInterest && (
                <td className={td}>
                  <Money amount={row.interest} compact />
                </td>
              )}
              {hasInterest && (
                <td className={cn(td, "hidden font-medium sm:table-cell")}>
                  <Money amount={row.payment} compact />
                </td>
              )}
              <td className={cn(td, "text-muted-foreground")}>
                <Money amount={row.balance} compact />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > SCHEDULE_PREVIEW && (
        <Button variant="ghost" size="sm" className="self-center text-muted-foreground" onClick={() => setAll((value) => !value)}>
          {all ? "접기" : `전체 ${rows.length}회 보기`}
        </Button>
      )}
    </div>
  );
}

function ActualTable({ liability }: { liability: Liability }) {
  const data = useHousehold();
  const rows = liabilityHistory(history(data), liability.id).toReversed();
  // 무이자 할부의 이자, 원금 유지 차용금의 원금은 늘 0이라 보여 줄 것이 없다
  const showPrincipal = liability.kind !== "interest_only";
  const showInterest = liability.kind !== "installment";
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">아직 비교할 기록이 없어요.</p>;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th scope="col" className={cn(th, "text-left")}>
            월
          </th>
          {showPrincipal && (
            <th scope="col" className={th}>
              원금 상환
            </th>
          )}
          {showInterest && (
            <th scope="col" className={th}>
              이자·지급
            </th>
          )}
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((row) => (
          <tr key={row.month}>
            <th scope="row" className="py-2.5 text-left align-top font-normal tabular-nums">
              {formatYmShort(row.month)}
              {row.provisional && <span className="block text-caption text-muted-foreground">잠정</span>}
            </th>
            {showPrincipal && <PlannedActual planned={row.plannedPrincipal} actual={row.principalPaid} />}
            {showInterest && <PlannedActual planned={row.plannedInterest} actual={row.interestPaid} />}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PlannedActual({ planned, actual }: { planned: number; actual: number | null }) {
  const differs = actual !== null && actual !== planned;
  return (
    <td className="py-2.5 text-right align-top tabular-nums">
      {actual === null ? (
        <span className="text-muted-foreground">미확인</span>
      ) : (
        <Money amount={actual} compact className={cn("font-medium", differs && "text-foreground")} />
      )}
      <span className="block text-caption text-muted-foreground">
        예정 {formatCompactWon(planned)}
        {differs && <Badge variant="outline" className="ml-1 h-5 px-1.5">다름</Badge>}
      </span>
    </td>
  );
}

function LiabilityActions({ model }: { model: LiabilityItemModel }) {
  const data = useHousehold();
  const mutate = useMutate();
  const latest = latestMonth(data);
  const { liability, line } = model;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [formKey, setFormKey] = useState(0);
  const balance = line?.balance ?? 0;
  const snapshot = latest
    ? (data.monthData[latest.id] ?? EMPTY_MONTH_DATA).liabilitySnapshots.find((s) => s.liability_id === liability.id)
    : undefined;

  function open(next: Exclude<Dialog, null>) {
    setFormKey((key) => key + 1);
    setDialog(next);
  }
  const onOpenChange = (next: boolean) => !next && setDialog(null);

  async function setActive(isActive: boolean) {
    if (!isActive && balance > 0) {
      toast("남은 원금이 있어 보관할 수 없습니다", { description: "‘완납·정리’로 잔액 0원을 기록하면 함께 보관됩니다." });
      return;
    }
    await mutate(() => updateRow<Liability>("liabilities", liability, { is_active: isActive }), {
      success: isActive ? "보관을 해제했습니다" : "보관했습니다",
    });
  }

  async function payOff() {
    if (!latest) return;
    const result = await mutate(
      async () => {
        await saveLiabilitySnapshot(latest.id, liability.id, snapshot, { balance: 0 });
        await updateRow<Liability>("liabilities", liability, { is_active: false });
      },
      { success: "완납을 기록하고 보관했습니다" },
    );
    if (!result.ok) throw new Error("완납 실패");
  }

  function requestDelete() {
    const earlier = history(data)
      .slice(0, -1)
      .some((point) => point.report.liabilityLines.some((l) => l.liabilityId === liability.id));
    if (earlier) {
      toast("지난 기록이 있어 삭제할 수 없습니다", { description: "다 갚았다면 ‘완납·정리’로 보관해 주세요." });
      return;
    }
    open("delete");
  }

  async function remove() {
    const result = await mutate(
      async () => {
        // 이번 달에 처음 적은 잔액만 있는 부채: 기록을 먼저 지워야 부채를 지울 수 있다
        if (snapshot) await clearSnapshotOrEntry("liability_snapshots", snapshot.id);
        await deleteRow("liabilities", liability.id);
      },
      { success: "부채를 삭제했습니다" },
    );
    if (!result.ok) throw new Error("삭제 실패");
  }

  const month = latest ? formatMonthOnly(latest.month) : "";

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={() => open("balance")}>
        {month} 잔액 기록
      </Button>
      <Button variant="secondary" size="sm" onClick={() => open("edit")}>
        <Pencil aria-hidden />
        수정
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="더 보기" className="ml-auto">
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {liability.is_active && balance > 0 && (
            <DropdownMenuItem onSelect={() => open("payoff")}>
              <CircleCheck aria-hidden />
              완납·정리
            </DropdownMenuItem>
          )}
          {liability.is_active ? (
            <DropdownMenuItem onSelect={() => void setActive(false)}>
              <Archive aria-hidden />
              보관
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => void setActive(true)}>
              <ArchiveRestore aria-hidden />
              보관 해제
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={requestDelete}>
            <Trash2 aria-hidden />
            삭제
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LiabilityFormDialog key={`edit-${formKey}`} open={dialog === "edit"} onOpenChange={onOpenChange} liability={liability} />
      <LiabilityBalanceDialog key={`balance-${formKey}`} open={dialog === "balance"} onOpenChange={onOpenChange} liability={liability} line={line} />
      <ConfirmDialog
        open={dialog === "payoff"}
        onOpenChange={onOpenChange}
        title="다 갚았나요?"
        description={`${month} 말 잔액을 0원으로 기록하고 보관합니다. 갚은 돈이 나간 통장의 잔액도 정산에서 함께 반영해 주세요.`}
        confirmLabel="완납·정리"
        onConfirm={payOff}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={onOpenChange}
        title="이 부채를 삭제할까요?"
        description="이번 달 기록과 함께 지워지며 되돌릴 수 없습니다."
        confirmLabel="삭제"
        destructive
        onConfirm={remove}
      />
    </div>
  );
}
