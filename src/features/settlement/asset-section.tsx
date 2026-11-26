"use client";

import { ArrowUpRight, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Delta, Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { PocketBadge } from "@/components/pocket-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pocketName, pocketTone } from "@/lib/data/derive";
import { ASSET_KINDS } from "@/lib/finance";
import type { AssetLine, PocketId, Won } from "@/lib/finance/types";
import { JOINT } from "@/lib/finance/types";
import { formatCompactWon } from "@/lib/format";

import { clearAssetLine, hasOpeningValues, saveAssetLine, saveInputs } from "./actions";
import {
  assetValueChange,
  BALANCE_JUMP_HINT,
  balanceJump,
  balanceWithPlannedSaving,
  plannedSavingsByAsset,
  principalAfter,
  progressOf,
  rowIdOf,
} from "./model";
import { useOpenMonth } from "./month-context";
import { ConfirmedValue, EditGroup, InputWithQuick, PendingMark, QuickButton, Row, RowActions, RowHead } from "./rows";
import { useSaver } from "./save-status";
import { SectionCard } from "./section-card";
import { MetricTip } from "./tips";

export function AssetSection({ open, onOpenChange, step }: { open: boolean; onOpenChange: (open: boolean) => void; step: number }) {
  const ctx = useOpenMonth();
  const { data, report, items } = ctx;
  const { save, isPending } = useSaver();
  const baseline = report.isBaseline;
  const planned = plannedSavingsByAsset(report.planLines);

  const pockets: PocketId[] = [...data.members.map((member) => member.id), JOINT];
  const groups = pockets
    .map((pocket) => ({ pocket, lines: report.assetLines.filter((line) => line.pocket === pocket) }))
    .filter((group) => group.lines.length > 0);
  const unconfirmed = report.assetLines.filter((line) => !line.confirmed);

  function keepAll() {
    void save(
      unconfirmed.map((line) => `asset:${line.assetId}`),
      () =>
        saveInputs(ctx, {
          assetSnapshots: unconfirmed.map((line) => ({ asset_id: line.assetId, value: line.openValue, principal: line.openPrincipal })),
        }),
    );
  }

  return (
    <SectionCard
      id="section-assets"
      step={step}
      title={baseline ? "자산 잔액" : "잔액"}
      progress={progressOf(items, "assets")}
      open={open}
      onOpenChange={onOpenChange}
      description={baseline ? "출발점이 되는 잔액입니다. 지금 계좌에 있는 금액을 적어 주세요." : "그 달 말일 잔액을 적습니다."}
      action={
        !baseline &&
        unconfirmed.length > 1 && (
          <Button variant="outline" size="sm" onClick={keepAll} loading={unconfirmed.some((line) => isPending(`asset:${line.assetId}`))}>
            나머지 모두 변동 없음
          </Button>
        )
      }
    >
      {groups.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">등록된 자산이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={group.pocket} aria-label={`${pocketName(data, group.pocket)} 자산`}>
              <h4 className="mb-1 border-b pb-2">
                <PocketBadge tone={pocketTone(data, group.pocket)}>{pocketName(data, group.pocket)}</PocketBadge>
              </h4>
              <ul className="divide-y">
                {group.lines.map((line) => (
                  <AssetRow key={`${line.assetId}:${line.confirmed}:${line.value}:${line.principal}`} line={line} plannedSaving={planned[line.assetId]} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="mt-4 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
        이번 달에 새로 생긴 자산은
        <Button asChild variant="link" className="text-sm">
          <Link href="/assets">
            자산 화면에서 추가
            <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        </Button>
        하세요.
      </p>
    </SectionCard>
  );
}

function AssetRow({ line, plannedSaving }: { line: AssetLine; plannedSaving: Won | undefined }) {
  const ctx = useOpenMonth();
  const { data, report } = ctx;
  const { save, isPending } = useSaver();
  const key = `asset:${line.assetId}`;
  const pending = isPending(key);
  const baseline = report.isBaseline;
  const valuation = ASSET_KINDS[line.kind].tracking === "valuation";
  // 자동차·부동산 같은 평가형 자산은 돈을 넣고 빼는 계좌가 아니다: 순입금은 기본 0, 필요할 때만 연다
  const investment = ASSET_KINDS[line.kind].investment;
  const archived = data.assets.find((asset) => asset.id === line.assetId)?.is_active === false;

  const [editing, setEditing] = useState(false);
  const showEditor = !line.confirmed || editing;
  const [value, setValue] = useState<Won | null>(line.confirmed ? line.value : null);
  // 평가형: 이번 달 순입금(기본은 연결된 저축 계획) · 기준 월: 투자 원금(비우면 평가금액과 같다)
  const [net, setNet] = useState<Won | null>(line.confirmed ? line.contributed : (plannedSaving ?? 0));
  const [principal, setPrincipal] = useState<Won | null>(line.confirmed ? line.principal : null);
  const [showNet, setShowNet] = useState(investment || (net ?? 0) !== 0);
  const jump = line.confirmed && !baseline ? balanceJump(line.openValue, line.value) : null;

  function persist(nextValue: Won, nextPrincipal: Won) {
    if (line.confirmed && nextValue === line.value && nextPrincipal === line.principal) {
      setEditing(false);
      return;
    }
    void save(key, () => saveAssetLine(ctx, line, { value: nextValue, principal: nextPrincipal })).then((ok) => ok && setEditing(false));
  }

  function commit() {
    if (value === null) return;
    if (!valuation) return persist(value, value);
    if (baseline) return persist(value, principal ?? value);
    persist(value, principalAfter(line, net ?? 0));
  }

  const canClear = line.confirmed && !hasOpeningValues(ctx, line.assetId);
  const hasPlan = !valuation && plannedSaving !== undefined && plannedSaving !== 0;
  const keepButton = (primary: boolean) => (
    <QuickButton primary={primary} disabled={pending} onClick={() => persist(line.openValue, line.openPrincipal)}>
      변동 없음
    </QuickButton>
  );
  const planButton = (primary: boolean) => (
    <QuickButton
      primary={primary}
      disabled={pending}
      onClick={() => {
        const next = balanceWithPlannedSaving(line, plannedSaving!);
        persist(next, next);
      }}
    >
      예정대로 {formatCompactWon(plannedSaving!, { sign: true }).replace(/\s?원$/, "")}
    </QuickButton>
  );

  const balanceInput = (
    <MoneyInput
      value={value}
      onChange={setValue}
      placeholder={baseline ? "잔액" : "이번 달 잔액"}
      aria-label={`${line.name} 잔액`}
      disabled={pending}
      autoFocus={editing}
    />
  );

  return (
    <Row id={rowIdOf("asset", line.assetId)} unconfirmed={!line.confirmed}>
      <RowHead
        title={
          <>
            <span className="truncate">{line.name}</span>
            {archived && <Badge variant="outline">보관됨</Badge>}
          </>
        }
        sub={
          baseline ? (
            <span>{ASSET_KINDS[line.kind].label}</span>
          ) : (
            <span>
              전월 <Money amount={line.openValue} />
            </span>
          )
        }
        aside={
          line.confirmed && !editing ? (
            <ConfirmedValue amount={line.value} label={line.name} pending={pending} onClick={() => setEditing(true)}>
              {!baseline && <Delta amount={assetValueChange(line)} compact className="text-caption" />}
              {baseline && valuation && (
                <span className="text-caption text-muted-foreground">
                  원금 <Money amount={line.principal} compact />
                </span>
              )}
            </ConfirmedValue>
          ) : (
            !line.confirmed && <PendingMark pending={pending} />
          )
        }
      />
      {archived && !line.confirmed && (
        <p className="mt-1 text-caption text-muted-foreground">해지·매각했다면 0을 기록해야 집계에서 정리됩니다.</p>
      )}
      {line.confirmed && !editing && valuation && !baseline && (
        <p className="mt-0.5 text-caption text-muted-foreground">
          {investment ? (
            <>
              순입금 <Money amount={line.contributed} sign compact /> · 평가손익 <Money amount={line.gain} sign compact />
            </>
          ) : (
            <>
              {line.contributed !== 0 && (
                <>
                  순입금 <Money amount={line.contributed} sign compact /> ·{" "}
                </>
              )}
              평가 변동 <Money amount={line.gain} sign compact />
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
      {showEditor && (
        <EditGroup onCommit={commit} className="mt-2 flex flex-col gap-1">
          {valuation ? (
            <div className="grid gap-x-3 sm:grid-cols-2">
              <LabeledInput label="평가금액">
                <InputWithQuick
                  input={
                    <MoneyInput value={value} onChange={setValue} placeholder="이번 달 평가금액" aria-label={`${line.name} 평가금액`} disabled={pending} autoFocus={editing} />
                  }
                  quick={!baseline && keepButton(true)}
                />
              </LabeledInput>
              {baseline ? (
                <LabeledInput label="투자 원금" tip>
                  <MoneyInput value={principal} onChange={setPrincipal} allowNegative placeholder="비우면 평가금액" aria-label={`${line.name} 투자 원금`} disabled={pending} />
                </LabeledInput>
              ) : showNet ? (
                <LabeledInput label="이번 달 순입금" hint="넣은 돈 − 뺀 돈" tip>
                  <MoneyInput value={net} onChange={setNet} allowNegative aria-label={`${line.name} 이번 달 순입금`} disabled={pending} />
                </LabeledInput>
              ) : null}
            </div>
          ) : hasPlan && !baseline ? (
            // 저축 계획이 있는 잔액형: 두 빠른 확인 버튼을 나란히 둔다 (좁은 화면에서는 입력 칸 아래 한 줄)
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0 sm:flex-1">{balanceInput}</div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                {planButton(true)}
                {keepButton(true)}
              </div>
            </div>
          ) : (
            <InputWithQuick input={balanceInput} quick={!baseline && keepButton(true)} />
          )}
          <RowActions>
            {valuation && !baseline && !showNet && (
              <QuickButton variant="ghost" disabled={pending} className="-ml-2 text-muted-foreground" onClick={() => setShowNet(true)}>
                <Plus aria-hidden />
                순입금 입력
              </QuickButton>
            )}
            {editing && canClear && (
              <QuickButton variant="ghost" disabled={pending} onClick={() => void save(key, () => clearAssetLine(ctx, line))}>
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

function LabeledInput({ label, hint, tip, children }: { label: string; hint?: string; tip?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-center gap-1 text-caption font-medium text-muted-foreground">
        {label}
        {hint && <span className="font-normal">({hint})</span>}
        {tip && <MetricTip id="principal" />}
      </span>
      {children}
    </div>
  );
}
