"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { pocketName } from "@/lib/data/derive";
import { clearSnapshotOrEntry, saveEntry } from "@/lib/data/mutations";
import { memberIdOf, pocketOf } from "@/lib/finance";
import type { MonthEntry, PocketId, Won } from "@/lib/finance/types";
import { JOINT } from "@/lib/finance/types";

import { useOpenMonth } from "./month-context";
import { useSaver } from "./save-status";

type Kind = "income" | "expense" | "transfer";

const COPY: Record<Kind, { add: string; edit: string; description: string; namePlaceholder: string; pocketLabel: string }> = {
  income: {
    add: "기타 수입 추가",
    edit: "기타 수입 수정",
    description: "이자, 환급, 성과급처럼 계획에 없던 현금 수입입니다.",
    namePlaceholder: "예: 예금 이자",
    pocketLabel: "받은 사람",
  },
  expense: {
    add: "주요 지출 추가",
    edit: "주요 지출 수정",
    description: "기록해 두고 싶은 큰 지출만 적습니다. 나머지는 미분류 지출로 남습니다.",
    namePlaceholder: "예: 경조사비",
    pocketLabel: "낸 주머니",
  },
  transfer: {
    add: "이동 추가",
    edit: "이동 수정",
    description: "주머니 사이로 옮긴 돈입니다. 같은 주머니 안의 이동은 적지 않아도 됩니다.",
    namePlaceholder: "예: 생활비 보충",
    pocketLabel: "보낸 주머니",
  },
};

/** 계획에 없던 항목(기타 수입 · 주요 지출 · 주머니 간 이동)을 추가·수정·삭제한다. */
export function EntryDialog({
  kind,
  entry,
  open,
  onOpenChange,
}: {
  kind: Kind;
  /** 있으면 수정 */
  entry?: MonthEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, month } = useOpenMonth();
  const { save } = useSaver();
  const copy = COPY[kind];
  const pockets: PocketId[] = [...data.members.map((member) => member.id), JOINT];
  const options = pockets.map((pocket) => ({ value: pocket, label: pocketName(data, pocket) }));

  const [name, setName] = useState(entry?.name ?? "");
  const [amount, setAmount] = useState<Won | null>(entry?.amount ?? null);
  const [from, setFrom] = useState<PocketId>(entry ? pocketOf(entry.member_id) : pocketOf(data.me.id));
  const [to, setTo] = useState<PocketId>(entry ? pocketOf(entry.to_member_id) : JOINT);
  const [errors, setErrors] = useState<{ name?: string; amount?: string; to?: string }>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pendingKey = entry ? `entry:${entry.id}` : `new:${kind}`;

  async function handleSubmit() {
    const next: typeof errors = {};
    const finalName = name.trim() || (kind === "transfer" ? `${pocketName(data, from)} → ${pocketName(data, to)}` : "");
    if (!finalName) next.name = "이름을 적어 주세요.";
    if (amount === null || amount <= 0) next.amount = "금액을 적어 주세요.";
    if (kind === "transfer" && from === to) next.to = "보낸 주머니와 다른 곳을 골라 주세요.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    const ok = await save(pendingKey, () =>
      saveEntry(month.id, entry, {
        kind,
        member_id: memberIdOf(from),
        to_member_id: kind === "transfer" ? memberIdOf(to) : null,
        name: finalName.slice(0, 60),
        amount: amount!,
      }),
    );
    setSaving(false);
    if (ok) onOpenChange(false);
  }

  async function handleDelete() {
    if (!entry) return;
    const ok = await save(pendingKey, () => clearSnapshotOrEntry("month_entries", entry.id), { success: "삭제했습니다" });
    if (!ok) throw new Error("삭제하지 못했습니다");
    onOpenChange(false);
  }

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title={entry ? copy.edit : copy.add}
        description={copy.description}
        onSubmit={() => void handleSubmit()}
        footer={
          <>
            {entry && (
              <Button type="button" variant="ghost" size="lg" className="text-destructive sm:mr-auto" onClick={() => setConfirmDelete(true)}>
                삭제
              </Button>
            )}
            <Button type="button" variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" size="lg" loading={saving}>
              저장
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <FormField label={kind === "transfer" ? "내용" : "이름"} optional={kind === "transfer"} error={errors.name}>
            {(control) => (
              <Input {...control} value={name} maxLength={60} placeholder={copy.namePlaceholder} onChange={(event) => setName(event.target.value)} />
            )}
          </FormField>
          <FormField label={copy.pocketLabel}>
            {(_, { labelId }) => (
              <SegmentedControl aria-labelledby={labelId} fullWidth options={options} value={from} onValueChange={setFrom} />
            )}
          </FormField>
          {kind === "transfer" && (
            <FormField label="받은 주머니" error={errors.to}>
              {(_, { labelId }) => <SegmentedControl aria-labelledby={labelId} fullWidth options={options} value={to} onValueChange={setTo} />}
            </FormField>
          )}
          <FormField label="금액" error={errors.amount}>
            {(control) => <MoneyInput {...control} value={amount} onChange={setAmount} />}
          </FormField>
        </div>
      </ResponsiveDialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`${entry?.name ?? ""}을(를) 삭제할까요?`}
        description="이 달의 기록에서 빠지고 결과가 다시 계산됩니다."
        confirmLabel="삭제"
        destructive
        onConfirm={handleDelete}
      />
    </>
  );
}
