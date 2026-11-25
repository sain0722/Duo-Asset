"use client";

import { ArrowRight, Plus } from "lucide-react";
import { useState } from "react";

import { Money } from "@/components/money";
import { PocketBadge } from "@/components/pocket-badge";
import { Button } from "@/components/ui/button";
import { pocketName, pocketTone } from "@/lib/data/derive";

import { clearAmountLine, saveAmountLine, saveInputs } from "./actions";
import { EntryDialog } from "./entry-dialog";
import { plannedEntryInputs, progressOf, rowIdOf } from "./model";
import { useOpenMonth } from "./month-context";
import { AmountRow } from "./rows";
import { useSaver } from "./save-status";
import { SectionCard } from "./section-card";

export function TransferSection({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const ctx = useOpenMonth();
  const { data, report, own, items } = ctx;
  const { save, isPending } = useSaver();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingEntry = own.entries.find((entry) => entry.id === editingId);
  const unconfirmed = report.contributionLines.filter((line) => line.actual === null && line.planned !== null);

  function confirmAll() {
    void save(
      unconfirmed.map((line) => `contribution:${line.key}`),
      () => saveInputs(ctx, { entries: plannedEntryInputs("contribution", unconfirmed, report.planLines) }),
    );
  }

  return (
    <SectionCard
      id="section-transfers"
      step={4}
      title="공용통장 입금·이동"
      progress={progressOf(items, "transfers")}
      open={open}
      onOpenChange={onOpenChange}
      description="주머니 사이로 옮긴 돈입니다. 소비가 아니라 내부 이동이에요."
      action={
        unconfirmed.length > 1 && (
          <Button variant="outline" size="sm" onClick={confirmAll} loading={unconfirmed.some((line) => isPending(`contribution:${line.key}`))}>
            모두 계획대로
          </Button>
        )
      }
    >
      {report.contributionLines.length > 0 && (
        <ul className="divide-y">
          {report.contributionLines.map((line) => (
            <AmountRow
              key={`${line.key}:${line.actual}`}
              rowId={rowIdOf("contribution", line.key)}
              pendingKey={`contribution:${line.key}`}
              title={
                <PocketBadge tone={pocketTone(data, line.pocket)} className="text-body">
                  {pocketName(data, line.pocket)} → 공용통장
                </PocketBadge>
              }
              planned={line.planned}
              actual={line.actual}
              onSave={(amount) => save(`contribution:${line.key}`, () => saveAmountLine(ctx, "contribution", line, amount))}
              onClear={() => save(`contribution:${line.key}`, () => clearAmountLine(line))}
            />
          ))}
        </ul>
      )}

      <div className="mt-4 border-t pt-4">
        <h4 className="text-sm font-medium">그 밖의 주머니 간 이동</h4>
        <p className="mt-0.5 text-caption text-muted-foreground">같은 주머니 안의 이동(내 통장 → 내 적금)은 적지 않아도 됩니다.</p>
        {report.transferLines.length > 0 && (
          <ul className="mt-2 divide-y">
            {report.transferLines.map((line) => (
              <li key={line.entryId}>
                <button
                  type="button"
                  onClick={() => setEditingId(line.entryId)}
                  className="-mx-2 flex min-h-14 w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <PocketBadge tone={pocketTone(data, line.from)}>{pocketName(data, line.from)}</PocketBadge>
                      <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" />
                      <span className="sr-only">에서</span>
                      <PocketBadge tone={pocketTone(data, line.to)}>{pocketName(data, line.to)}</PocketBadge>
                    </span>
                    <span className="mt-0.5 block truncate text-caption text-muted-foreground">{line.name}</span>
                  </span>
                  <Money amount={line.amount} className="text-body font-semibold" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="ghost" className="mt-1 -ml-2 text-muted-foreground" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          이동 추가
        </Button>
      </div>
      {adding && <EntryDialog kind="transfer" open={adding} onOpenChange={setAdding} />}
      {editingEntry && (
        <EntryDialog key={editingEntry.version} kind="transfer" entry={editingEntry} open onOpenChange={(next) => !next && setEditingId(null)} />
      )}
    </SectionCard>
  );
}
