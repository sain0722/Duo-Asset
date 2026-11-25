"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { PocketBadge } from "@/components/pocket-badge";
import { Button } from "@/components/ui/button";
import { pocketName, pocketTone } from "@/lib/data/derive";
import type { AmountLine } from "@/lib/finance/types";

import { clearAmountLine, saveAmountLine, saveInputs } from "./actions";
import { EntryDialog } from "./entry-dialog";
import { plannedEntryInputs, progressOf, rowIdOf } from "./model";
import { useOpenMonth } from "./month-context";
import { AmountRow, ConfirmedValue, Row, RowHead } from "./rows";
import { useSaver } from "./save-status";
import { SectionCard } from "./section-card";

export function IncomeSection({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const ctx = useOpenMonth();
  const { data, report, own, items } = ctx;
  const { save, isPending } = useSaver();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const planned = report.incomeLines.filter((line) => line.planned !== null);
  const extras = report.incomeLines.filter((line) => line.planned === null);
  const unconfirmed = planned.filter((line) => line.actual === null);
  const editingEntry = own.entries.find((entry) => entry.id === editingId);

  function confirmAll() {
    void save(
      unconfirmed.map((line) => `income:${line.key}`),
      () => saveInputs(ctx, { entries: plannedEntryInputs("income", unconfirmed, report.planLines) }),
    );
  }

  const badge = (line: AmountLine) => <PocketBadge tone={pocketTone(data, line.pocket)}>{pocketName(data, line.pocket)}</PocketBadge>;

  return (
    <SectionCard
      id="section-income"
      step={1}
      title="수입"
      progress={progressOf(items, "income")}
      open={open}
      onOpenChange={onOpenChange}
      description="실제로 받은 현금 수입입니다."
      action={
        unconfirmed.length > 1 && (
          <Button variant="outline" size="sm" onClick={confirmAll} loading={unconfirmed.some((line) => isPending(`income:${line.key}`))}>
            모두 계획대로
          </Button>
        )
      }
    >
      <ul className="divide-y">
        {planned.map((line) => (
          <AmountRow
            key={`${line.key}:${line.actual}`}
            rowId={rowIdOf("income", line.key)}
            pendingKey={`income:${line.key}`}
            title={line.name}
            sub={badge(line)}
            planned={line.planned}
            actual={line.actual}
            onSave={(amount) => save(`income:${line.key}`, () => saveAmountLine(ctx, "income", line, amount))}
            onClear={() => save(`income:${line.key}`, () => clearAmountLine(line))}
          />
        ))}
        {extras.map((line) => (
          <Row key={line.key} id={rowIdOf("income", line.key)}>
            <RowHead
              title={line.name}
              sub={
                <>
                  {badge(line)}
                  <span>기타 수입</span>
                </>
              }
              aside={
                <ConfirmedValue
                  amount={line.actual}
                  label={line.name}
                  pending={isPending(`entry:${line.entryId}`)}
                  onClick={() => setEditingId(line.entryId ?? null)}
                />
              }
            />
          </Row>
        ))}
      </ul>
      {planned.length === 0 && extras.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">이 달에 계획된 수입이 없습니다. 받은 돈이 있으면 기타 수입으로 추가하세요.</p>
      )}
      <Button variant="ghost" className="-ml-2 mt-2 text-muted-foreground" onClick={() => setAdding(true)}>
        <Plus aria-hidden />
        기타 수입
      </Button>
      {adding && <EntryDialog kind="income" open={adding} onOpenChange={setAdding} />}
      {editingEntry && (
        <EntryDialog key={editingEntry.version} kind="income" entry={editingEntry} open onOpenChange={(next) => !next && setEditingId(null)} />
      )}
    </SectionCard>
  );
}
