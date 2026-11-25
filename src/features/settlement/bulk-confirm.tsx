"use client";

import { ListChecks } from "lucide-react";
import { useMemo, useState } from "react";

import { Money } from "@/components/money";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { suggestInputs } from "@/lib/finance";

import { saveInputs } from "./actions";
import {
  remainingAfter,
  suggestionInputs,
  suggestionRows,
  type CheckItem,
  type MonthInputs,
  type SectionId,
  type SuggestionRow,
} from "./model";
import { useOpenMonth } from "./month-context";
import { useSaver } from "./save-status";

const GROUPS: { section: SectionId; title: string }[] = [
  { section: "income", title: "수입" },
  { section: "assets", title: "잔액" },
  { section: "liabilities", title: "부채" },
  { section: "transfers", title: "공용통장 입금" },
];

/**
 * "예정대로 N건 한 번에 확인". 값이 구조상 정해진 항목(예적금·보증금, 부채, 계획된 수입·납입)을
 * 목록으로 보여 주고, 사용자가 확인을 눌러야 한 번에 저장한다 (finance-rules 8절 8항).
 * 저장한 뒤에는 남은 미확인(통장·투자자산 등) 첫 줄로 이동한다.
 */
export function BulkConfirm({ onDone }: { onDone: (next: CheckItem | undefined) => void }) {
  const ctx = useOpenMonth();
  const { report, items } = ctx;
  const { save, isPending } = useSaver();
  const suggested = useMemo(() => suggestInputs(report), [report]);
  const rows = useMemo(() => suggestionRows(suggested, report), [suggested, report]);
  // 확인 창은 연 순간의 목록을 그대로 보여 주고 그대로 저장한다 (저장 뒤 재조회로 목록이 비어도 깜빡이지 않게)
  const [shown, setShown] = useState<{ rows: SuggestionRow[]; inputs: MonthInputs; next: CheckItem | undefined } | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = saving || rows.some((row) => isPending(row.pendingKey));

  if (rows.length === 0 && !shown) return null;
  const count = shown?.rows.length ?? rows.length;

  function openDialog() {
    setShown({ rows, inputs: suggestionInputs(suggested, report), next: remainingAfter(items, rows)[0] });
  }

  async function confirm() {
    if (!shown) return;
    setSaving(true);
    const ok = await save(
      shown.rows.map((row) => row.pendingKey),
      () => saveInputs(ctx, shown.inputs),
      { success: `${shown.rows.length}건을 예정대로 확인했습니다` },
    );
    setSaving(false);
    setShown(null);
    if (ok) onDone(shown.next);
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl bg-brand/8 p-4 sm:flex-row sm:items-center sm:justify-between dark:bg-brand/12">
        <p className="min-w-0 text-sm">
          <span className="font-medium">예금·적금·대출·급여처럼 값이 정해진 {count}건</span>
          <span className="text-muted-foreground">은 목록을 보고 한 번에 확인할 수 있어요.</span>
        </p>
        <Button variant="brand" className="w-full shrink-0 sm:w-auto" loading={busy} onClick={openDialog}>
          <ListChecks aria-hidden />
          예정대로 {count}건 한 번에 확인
        </Button>
      </div>

      <ResponsiveDialog
        open={shown !== null}
        onOpenChange={(next) => !next && !saving && setShown(null)}
        title={`예정대로 ${count}건 확인`}
        description="아래 값으로 확인합니다. 실제와 다른 항목은 확인한 뒤 그 행에서 고칠 수 있어요."
        footer={
          <>
            <Button type="button" variant="secondary" size="lg" disabled={saving} onClick={() => setShown(null)}>
              취소
            </Button>
            <Button type="button" size="lg" loading={saving} onClick={() => void confirm()}>
              {count}건 확인
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {GROUPS.map((group) => {
            const groupRows = (shown?.rows ?? []).filter((row) => row.section === group.section);
            if (groupRows.length === 0) return null;
            return (
              <section key={group.section} aria-label={group.title}>
                <h4 className="border-b pb-1.5 text-sm font-semibold text-muted-foreground">{group.title}</h4>
                <ul className="divide-y">
                  {groupRows.map((row) => (
                    <SuggestionItem key={row.pendingKey} row={row} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </ResponsiveDialog>
    </>
  );
}

function SuggestionItem({ row }: { row: SuggestionRow }) {
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="block truncate text-body">{row.name}</span>
        <span className="block text-caption text-muted-foreground">{row.reason}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <Money amount={row.amount} className="text-body font-semibold" />
        {row.extra !== null && (
          <span className="text-caption text-muted-foreground">
            {row.extraLabel} <Money amount={row.extra} />
          </span>
        )}
      </span>
    </li>
  );
}
