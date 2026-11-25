"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Money } from "@/components/money";
import { PocketBadge } from "@/components/pocket-badge";
import { Button } from "@/components/ui/button";
import { pocketTone } from "@/lib/data/derive";
import type { AmountLine } from "@/lib/finance/types";
import { JOINT } from "@/lib/finance/types";

import { clearAmountLine, saveAmountLine } from "./actions";
import { EntryDialog } from "./entry-dialog";
import { rowIdOf } from "./model";
import { useOpenMonth } from "./month-context";
import { AmountRow, ConfirmedValue, Row, RowHead } from "./rows";
import { useSaver } from "./save-status";
import { SectionCard } from "./section-card";
import { MetricTip } from "./tips";

const isInterestLine = (line: AmountLine) => line.key.startsWith("liability:");

/** 지출 확인(선택). 소비는 잔액에서 역산되므로 건너뛰어도 마감할 수 있다. */
export function ExpenseSection({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const ctx = useOpenMonth();
  const { data, report, own } = ctx;
  const { save, isPending } = useSaver();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingEntry = own.entries.find((entry) => entry.id === editingId);

  return (
    <SectionCard
      id="section-expenses"
      step={5}
      title="지출 확인"
      optional
      open={open}
      onOpenChange={onOpenChange}
      description="건너뛰어도 마감할 수 있어요. 소비는 잔액 변화로 계산되고, 적지 않은 지출은 미분류로 남습니다."
    >
      <div className="flex flex-col gap-6">
        {report.pockets.map((pocket) => {
          const lines = pocket.expenseLines;
          const unclassifiedLabel = pocket.pocket === JOINT ? "공동생활비" : "개인 생활비";
          return (
            <section key={pocket.pocket} aria-label={`${pocket.name} 지출`}>
              <h4 className="flex min-h-9 items-center justify-between gap-3 border-b pb-2">
                <PocketBadge tone={pocketTone(data, pocket.pocket)}>{pocket.name}</PocketBadge>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  소비
                  <MetricTip id="pocketConsumption" />
                  {report.complete ? (
                    <Money amount={pocket.consumption} className="font-semibold text-foreground" />
                  ) : (
                    <span>정산 전</span>
                  )}
                </span>
              </h4>
              <ul className="divide-y">
                {lines.map((line) => {
                  if (isInterestLine(line)) {
                    return (
                      <Row key={line.key} id={rowIdOf("expense", line.key)}>
                        <RowHead
                          title={line.name}
                          sub={line.planned !== null && <span>예정 <Money amount={line.planned} /></span>}
                          aside={
                            line.actual === null ? (
                              <span className="text-caption text-muted-foreground">부채에서 입력</span>
                            ) : (
                              <ConfirmedValue amount={line.actual} label={line.name} />
                            )
                          }
                        />
                      </Row>
                    );
                  }
                  if (line.planned === null) {
                    return (
                      <Row key={line.key} id={rowIdOf("expense", line.key)}>
                        <RowHead
                          title={line.name}
                          sub={<span>추가 지출</span>}
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
                    );
                  }
                  return (
                    <AmountRow
                      key={`${line.key}:${line.actual}`}
                      optional
                      rowId={rowIdOf("expense", line.key)}
                      pendingKey={`expense:${line.key}`}
                      title={line.name}
                      planned={line.planned}
                      actual={line.actual}
                      onSave={(amount) => save(`expense:${line.key}`, () => saveAmountLine(ctx, "expense", line, amount))}
                      onClear={() => save(`expense:${line.key}`, () => clearAmountLine(line))}
                    />
                  );
                })}
                <li className="flex min-h-14 items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-1 text-body text-muted-foreground">
                    미분류 ({unclassifiedLabel})
                    <MetricTip id="unclassified" />
                  </span>
                  {report.complete ? (
                    <Money amount={pocket.unclassified} className="text-body font-semibold" />
                  ) : (
                    <span className="text-sm text-muted-foreground">정산 전</span>
                  )}
                </li>
              </ul>
            </section>
          );
        })}
      </div>
      <Button variant="ghost" className="mt-2 -ml-2 text-muted-foreground" onClick={() => setAdding(true)}>
        <Plus aria-hidden />
        주요 지출 추가
      </Button>
      {adding && <EntryDialog kind="expense" open={adding} onOpenChange={setAdding} />}
      {editingEntry && (
        <EntryDialog key={editingEntry.version} kind="expense" entry={editingEntry} open onOpenChange={(next) => !next && setEditingId(null)} />
      )}
    </SectionCard>
  );
}
