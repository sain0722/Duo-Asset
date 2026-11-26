"use client";

import { ArrowUpRight, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Delta, Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { PocketBadge } from "@/components/pocket-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pocketName, pocketTone } from "@/lib/data/derive";
import { LIABILITY_KINDS } from "@/lib/finance";
import type { LiabilityLine, Won } from "@/lib/finance/types";
import { formatNumber } from "@/lib/format";

import { clearLiabilityLine, saveInputs, saveLiabilityLine } from "./actions";
import { BALANCE_JUMP_HINT, balanceJump, liabilityChange, progressOf, rowIdOf, scheduledBalance } from "./model";
import { useOpenMonth } from "./month-context";
import { ConfirmedValue, EditGroup, InputWithQuick, PendingMark, QuickButton, Row, RowActions, RowHead } from "./rows";
import { useSaver } from "./save-status";
import { SectionCard } from "./section-card";

export function LiabilitySection({ open, onOpenChange, step }: { open: boolean; onOpenChange: (open: boolean) => void; step: number }) {
  const ctx = useOpenMonth();
  const { report, items } = ctx;
  const { save, isPending } = useSaver();
  const baseline = report.isBaseline;
  const unconfirmed = report.liabilityLines.filter((line) => !line.confirmed);

  function confirmAll() {
    void save(
      unconfirmed.map((line) => `liability:${line.liabilityId}`),
      () =>
        saveInputs(ctx, {
          liabilitySnapshots: unconfirmed.map((line) => ({
            liability_id: line.liabilityId,
            balance: scheduledBalance(line),
            ...(hasInterest(line, ctx.data.liabilities) ? { interest_paid: line.plannedInterest } : {}),
          })),
        }),
    );
  }

  return (
    <SectionCard
      id="section-liabilities"
      step={step}
      title={baseline ? "부채 잔액" : "부채"}
      progress={progressOf(items, "liabilities")}
      open={open}
      onOpenChange={onOpenChange}
      description={baseline ? "지금 남은 원금을 적어 주세요." : "이번 달 말에 남은 원금을 적습니다."}
      action={
        !baseline &&
        unconfirmed.length > 1 && (
          <Button variant="outline" size="sm" onClick={confirmAll} loading={unconfirmed.some((line) => isPending(`liability:${line.liabilityId}`))}>
            모두 예정대로
          </Button>
        )
      }
    >
      {report.liabilityLines.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          등록된 부채가 없습니다.{" "}
          <Button asChild variant="link" className="text-sm">
            <Link href="/liabilities">
              부채 등록
              <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
          </Button>
        </p>
      ) : (
        <ul className="divide-y">
          {report.liabilityLines.map((line) => (
            <LiabilityRow key={`${line.liabilityId}:${line.confirmed}:${line.balance}:${line.interestPaid}`} line={line} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/** 이자(또는 원금 유지 차용금의 정기 지급)를 따로 확인할 부채인가 */
function hasInterest(line: LiabilityLine, liabilities: { id: string; kind: LiabilityLine["kind"] }[]): boolean {
  const kind = liabilities.find((l) => l.id === line.liabilityId)?.kind ?? line.kind;
  return line.plannedInterest > 0 || kind === "interest_only" || line.interestPaid !== null;
}

function LiabilityRow({ line }: { line: LiabilityLine }) {
  const ctx = useOpenMonth();
  const { data, report } = ctx;
  const { save, isPending } = useSaver();
  const key = `liability:${line.liabilityId}`;
  const pending = isPending(key);
  const baseline = report.isBaseline;
  const withInterest = !baseline && hasInterest(line, data.liabilities);
  const interestLabel = line.kind === "interest_only" ? "이번 달 지급액" : "이번 달 이자";
  const scheduled = scheduledBalance(line);
  const onSchedule = line.plannedPrincipal > 0 || line.plannedInterest > 0;
  const liability = data.liabilities.find((l) => l.id === line.liabilityId);
  const snapshot = ctx.own.liabilitySnapshots.find((s) => s.liability_id === line.liabilityId);

  // 자릿수 실수로 원금 상환·신규 차입이 크게 잡히는 것을 알려 준다 (막지는 않는다)
  const jump = line.confirmed && !baseline ? balanceJump(line.openBalance, line.balance) : null;

  const [editing, setEditing] = useState(false);
  const [balance, setBalance] = useState<Won | null>(line.confirmed ? line.balance : null);
  const [interest, setInterest] = useState<Won | null>(line.interestPaid);

  const balanceInput = (
    <MoneyInput
      value={balance}
      onChange={setBalance}
      placeholder={baseline ? "남은 원금" : "이번 달 잔액"}
      aria-label={`${line.name} 남은 원금`}
      disabled={pending}
      autoFocus={editing}
    />
  );
  const scheduleButton = (primary: boolean) => (
    <QuickButton primary={primary} disabled={pending} onClick={() => persist(scheduled, withInterest ? line.plannedInterest : null)}>
      {onSchedule ? "예정대로" : "변동 없음"}
    </QuickButton>
  );

  function persist(nextBalance: Won, nextInterest: Won | null) {
    if (line.confirmed && nextBalance === line.balance && nextInterest === line.interestPaid) {
      setEditing(false);
      return;
    }
    void save(key, () =>
      saveLiabilityLine(ctx, line, withInterest ? { balance: nextBalance, interest_paid: nextInterest } : { balance: nextBalance }),
    ).then((ok) => ok && setEditing(false));
  }

  return (
    <Row id={rowIdOf("liability", line.liabilityId)} unconfirmed={!line.confirmed}>
      <RowHead
        title={
          <>
            <span className="truncate">{line.name}</span>
            {liability?.is_active === false && <Badge variant="outline">보관됨</Badge>}
          </>
        }
        sub={
          <>
            <PocketBadge tone={pocketTone(data, line.pocket)} className="text-caption">
              {pocketName(data, line.pocket)}
            </PocketBadge>
            {baseline ? (
              <span>{LIABILITY_KINDS[line.kind].label}</span>
            ) : (
              <>
                <span>
                  전월 <Money amount={line.openBalance} />
                </span>
                {line.plannedPrincipal > 0 && (
                  <span>
                    예정 <Money amount={scheduled} />
                  </span>
                )}
              </>
            )}
          </>
        }
        aside={
          line.confirmed && !editing ? (
            <ConfirmedValue amount={line.balance} label={line.name} pending={pending} onClick={() => setEditing(true)}>
              {!baseline && <Delta amount={liabilityChange(line)} compact className="text-caption" />}
            </ConfirmedValue>
          ) : (
            !line.confirmed && <PendingMark pending={pending} />
          )
        }
      />
      {line.confirmed && !editing && withInterest && (
        <p className="mt-0.5 text-caption text-muted-foreground">
          {line.kind === "interest_only" ? "지급액" : "이자"}{" "}
          {line.interestPaid === null ? "미입력" : <Money amount={line.interestPaid} />}
          {line.plannedInterest > 0 && (
            <>
              {" "}
              · 예정 <Money amount={line.plannedInterest} />
            </>
          )}
        </p>
      )}
      {jump && !editing && (
        <p className="mt-1 flex gap-1.5 text-caption font-medium text-warning-foreground">
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {BALANCE_JUMP_HINT[jump]}
        </p>
      )}
      {(!line.confirmed || editing) && (
        <EditGroup onCommit={() => balance !== null && persist(balance, interest)} className="mt-2 flex flex-col gap-1">
          {withInterest ? (
            <div className="grid gap-x-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-caption font-medium text-muted-foreground">남은 원금</span>
                {balanceInput}
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-caption font-medium text-muted-foreground">
                  {interestLabel} <span className="font-normal">(선택)</span>
                </span>
                <MoneyInput
                  value={interest}
                  onChange={setInterest}
                  placeholder={line.plannedInterest > 0 ? `예정 ${formatNumber(line.plannedInterest)}` : "금액"}
                  aria-label={`${line.name} ${interestLabel}`}
                  disabled={pending}
                />
              </div>
            </div>
          ) : (
            <InputWithQuick input={balanceInput} quick={!baseline && scheduleButton(true)} />
          )}
          <RowActions>
            {!baseline && withInterest && scheduleButton(false)}
            {editing && snapshot?.opening_balance == null && (
              <QuickButton variant="ghost" disabled={pending} onClick={() => void save(key, () => clearLiabilityLine(ctx, line))}>
                확인 취소
              </QuickButton>
            )}
            {editing && (
              <QuickButton variant="ghost" className="ml-auto" onClick={() => setEditing(false)}>
                닫기
              </QuickButton>
            )}
          </RowActions>
        </EditGroup>
      )}
    </Row>
  );
}
