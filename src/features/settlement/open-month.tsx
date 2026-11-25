"use client";

import { ArrowDown, Check } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useMediaQuery } from "@/hooks/use-media-query";
import { canClose, workingMonth } from "@/lib/data/derive";
import { closeMonth } from "@/lib/data/mutations";
import { EMPTY_MONTH_DATA, type HouseholdData } from "@/lib/data/types";
import { percentOf } from "@/lib/finance";
import type { MonthReport, MonthRow, Ym } from "@/lib/finance/types";
import { JOINT } from "@/lib/finance/types";
import { formatMonthOnly } from "@/lib/format";
import { addMonths, compareYm, currentYm } from "@/lib/month";
import { cn } from "@/lib/utils";

import { AssetSection } from "./asset-section";
import { ExpenseSection } from "./expense-section";
import { IncomeSection } from "./income-section";
import { LiabilitySection } from "./liability-section";
import { checklist, progressOf, type CheckItem, type SectionId } from "./model";
import { OpenMonthProvider, type OpenMonthContext } from "./month-context";
import { ResultBody } from "./result-panel";
import { SaveIndicator, SaverProvider, useSaver } from "./save-status";
import { TransferSection } from "./transfer-section";

export function OpenMonthView(props: { data: HouseholdData; month: MonthRow; report: MonthReport; onSelectMonth: (ym: Ym) => void }) {
  return (
    <SaverProvider>
      <OpenMonthInner {...props} />
    </SaverProvider>
  );
}

function OpenMonthInner({
  data,
  month,
  report,
  onSelectMonth,
}: {
  data: HouseholdData;
  month: MonthRow;
  report: MonthReport;
  onSelectMonth: (ym: Ym) => void;
}) {
  const { save } = useSaver();
  const isDesktop = useMediaQuery("(min-width: 64rem)");
  const items = useMemo(() => checklist(report, [...data.members.map((member) => member.id), JOINT]), [report, data.members]);
  const remaining = items.filter((item) => !item.done);
  const progress = progressOf(items);
  const closable = canClose(data, month);
  const blocker = closable ? null : workingMonth(data);
  const label = formatMonthOnly(month.month);
  const baseline = report.isBaseline;

  // 모바일은 확인할 것이 남은 영역만 펼쳐 두고, PC 는 모두 펼친다
  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>(() => {
    const pendingIn = (section: SectionId) => items.some((item) => item.section === section && !item.done);
    return {
      income: isDesktop || pendingIn("income"),
      assets: isDesktop || pendingIn("assets"),
      liabilities: isDesktop || pendingIn("liabilities"),
      transfers: isDesktop || pendingIn("transfers"),
      expenses: isDesktop,
    };
  });
  const setSection = (section: SectionId) => (open: boolean) => setOpenSections((current) => ({ ...current, [section]: open }));

  const jumpTo = useCallback((section: SectionId, rowId?: string) => {
    setOpenSections((current) => ({ ...current, [section]: true }));
    // 펼친 영역이 그려진 다음에 찾는다
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const target = document.getElementById(rowId ?? `section-${section}`);
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
      }),
    );
  }, []);
  const jumpToItem = (item: CheckItem) => jumpTo(item.section, item.rowId);
  const nextUnconfirmed = remaining.length > 0 ? () => jumpToItem(remaining[0]) : undefined;

  const ctx: OpenMonthContext = {
    data,
    month,
    report,
    own: data.monthData[month.id] ?? EMPTY_MONTH_DATA,
    items,
    jumpTo,
  };

  // 스냅샷은 월말 잔액이므로 달이 끝난 뒤(다음 달 1일부터)에만 마감할 수 있다
  const [confirming, setConfirming] = useState(false);
  const ended = compareYm(month.month, currentYm()) < 0;
  const canCloseNow = closable && report.complete && ended;
  const requestClose = () => {
    if (canCloseNow) setConfirming(true);
  };
  async function handleClose() {
    const ok = await save("close", () => closeMonth(month, report));
    if (!ok) throw new Error("마감하지 못했습니다");
    // 기본 달(정산할 달)이 다음 달로 바뀌므로, 방금 마감한 결과를 계속 보여 주도록 달을 고정한다
    onSelectMonth(month.month);
    const next = addMonths(month.month, 1);
    toast.success(`${label} 정산을 마감했습니다`, {
      action: { label: `${formatMonthOnly(next)} 정산하기`, onClick: () => onSelectMonth(next) },
    });
  }
  const nextLabel = formatMonthOnly(addMonths(month.month, 1));
  const closeReason = !report.complete
    ? `미확인 ${remaining.length}건을 확인하면 마감할 수 있습니다.`
    : !ended
      ? `${label}이 끝난 뒤 ${nextLabel} 1일부터 마감할 수 있습니다. 입력은 미리 해 두세요.`
      : null;

  return (
    <OpenMonthProvider value={ctx}>
      <div className="flex flex-col gap-4 sm:gap-5">
        {blocker && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warning/12 px-5 py-4">
            <p className="text-sm text-warning-foreground">
              <span className="font-semibold">{formatMonthOnly(blocker.month)}을 먼저 마감하세요.</span> 입력은 미리 해 둘 수 있어요.
            </p>
            <Button variant="outline" size="sm" onClick={() => onSelectMonth(blocker.month)}>
              {formatMonthOnly(blocker.month)}로 이동
            </Button>
          </div>
        )}

        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground">
                {baseline ? "기준 월 · 출발점이 되는 잔액" : `${label} 정산 진행`}
              </p>
              <SaveIndicator />
            </div>
            <p className="flex items-baseline gap-1.5">
              <span className="num-display text-3xl font-bold">{progress.done}</span>
              <span className="text-base text-muted-foreground tabular-nums">/ {progress.total} 확인</span>
            </p>
            <Progress
              value={percentOf(progress.done, progress.total)}
              tone={remaining.length === 0 ? "brand" : "ink"}
              aria-label="정산 진행률"
            />
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="text-sm">
                {remaining.length > 0 ? (
                  <>
                    남은 미확인 <span className="font-semibold tabular-nums">{remaining.length}건</span>
                  </>
                ) : (
                  <span className="flex items-center gap-1.5 text-brand">
                    <Check aria-hidden className="size-4" strokeWidth={2.5} />
                    모두 확인했어요{closable && ended ? ". 결과를 보고 마감하세요." : "."}
                  </span>
                )}
              </p>
              {nextUnconfirmed && (
                <Button variant="outline" size="sm" onClick={nextUnconfirmed}>
                  다음 미확인
                  <ArrowDown aria-hidden />
                </Button>
              )}
            </div>
            {baseline && (
              <p className="text-sm text-muted-foreground">
                첫 달은 비교할 이전 잔액이 없어 잔액만 기록합니다. 수입·소비 분석은 다음 달부터 시작해요.
              </p>
            )}
          </CardContent>
        </Card>

        {!baseline && <IncomeSection open={openSections.income} onOpenChange={setSection("income")} />}
        <AssetSection step={baseline ? 1 : 2} open={openSections.assets} onOpenChange={setSection("assets")} />
        <LiabilitySection step={baseline ? 2 : 3} open={openSections.liabilities} onOpenChange={setSection("liabilities")} />
        {!baseline && (
          <>
            <TransferSection open={openSections.transfers} onOpenChange={setSection("transfers")} />
            <ExpenseSection open={openSections.expenses} onOpenChange={setSection("expenses")} />
          </>
        )}

        <Card id="section-result" className="scroll-mt-24 lg:scroll-mt-8">
          <div className="flex items-center gap-3 px-5 sm:px-6">
            <span
              aria-hidden
              className="grid size-6 shrink-0 place-content-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground tabular-nums"
            >
              {baseline ? 3 : 6}
            </span>
            <h3 className="text-base font-semibold">결과</h3>
            {!report.complete && <span className="text-sm text-muted-foreground">정산 전</span>}
          </div>
          <CardContent>
            <ResultBody data={data} report={report} remaining={remaining} onJump={jumpToItem} />
          </CardContent>
          {closable && (
            <div className="hidden flex-col items-end gap-2 border-t px-6 pt-5 lg:flex">
              <Button size="lg" disabled={!canCloseNow} onClick={requestClose}>
                {label} 마감
              </Button>
              <p className="text-caption text-muted-foreground">
                {closeReason ?? "마감하면 결과가 확정되고 다음 달이 열립니다."}
              </p>
            </div>
          )}
        </Card>

        {/* 모바일 하단 고정 바(하단 탭 위)만큼 비워 둔다 */}
        <div aria-hidden className="h-16 lg:hidden" />
      </div>

      <MobileCloseBar
        closable={closable}
        complete={report.complete}
        ended={ended}
        nextLabel={nextLabel}
        remaining={remaining.length}
        label={label}
        blocker={blocker?.month ?? null}
        onNext={nextUnconfirmed}
        onClose={requestClose}
        onGoBlocker={() => blocker && onSelectMonth(blocker.month)}
      />

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`${label} 정산을 마감할까요?`}
        description={`이 달의 결과가 확정되고 ${nextLabel}이 열립니다. 가장 최근에 마감한 달은 다시 열어 고칠 수 있습니다.`}
        confirmLabel="마감"
        onConfirm={handleClose}
      />
    </OpenMonthProvider>
  );
}

/** 모바일 하단 고정 바. 하단 탭(h-14 + safe-area) 바로 위에 붙는다. */
function MobileCloseBar({
  closable,
  complete,
  ended,
  nextLabel,
  remaining,
  label,
  blocker,
  onNext,
  onClose,
  onGoBlocker,
}: {
  closable: boolean;
  complete: boolean;
  ended: boolean;
  nextLabel: string;
  remaining: number;
  label: string;
  blocker: Ym | null;
  onNext?: () => void;
  onClose: () => void;
  onGoBlocker: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t bg-card/95 px-safe backdrop-blur-md lg:hidden">
      <div className="mx-auto flex h-16 max-w-xl items-center justify-between gap-2 px-4">
        <p className={cn("min-w-0 text-sm", !complete && "text-muted-foreground")}>
          {blocker && closable === false ? (
            <>{formatMonthOnly(blocker)}을 먼저 마감하세요</>
          ) : complete && !ended ? (
            <>{nextLabel} 1일부터 마감할 수 있어요</>
          ) : complete ? (
            <span className="font-medium text-brand">마감할 수 있어요</span>
          ) : (
            <>
              미확인 <span className="font-semibold text-foreground tabular-nums">{remaining}건</span>
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {onNext && (
            <Button variant="outline" size="sm" onClick={onNext}>
              다음 미확인
            </Button>
          )}
          {closable ? (
            <Button size="sm" disabled={!complete || !ended} onClick={onClose}>
              {label} 마감
            </Button>
          ) : (
            blocker && (
              <Button size="sm" variant="secondary" onClick={onGoBlocker}>
                {formatMonthOnly(blocker)}로
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
