"use client";

import { useState } from "react";

import { FormField } from "@/components/form-field";
import { Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { latestMonth } from "@/lib/data/derive";
import { useHousehold, useMutate } from "@/lib/data/hooks";
import { saveLiabilitySnapshot } from "@/lib/data/mutations";
import { EMPTY_MONTH_DATA } from "@/lib/data/types";
import type { Liability, LiabilityLine, Won } from "@/lib/finance/types";
import { formatMonthOnly } from "@/lib/format";

/** 가장 최근 달 말 남은 원금과 실제 이자·지급액을 기록한다. 이자를 비워 두면 미확인으로 남는다. */
export function LiabilityBalanceDialog({
  open,
  onOpenChange,
  liability,
  line,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  liability: Liability;
  line: LiabilityLine | null;
}) {
  const data = useHousehold();
  const mutate = useMutate();
  const latest = latestMonth(data);
  const snapshot = latest
    ? (data.monthData[latest.id] ?? EMPTY_MONTH_DATA).liabilitySnapshots.find((s) => s.liability_id === liability.id)
    : undefined;

  const [balance, setBalance] = useState<Won | null>(snapshot ? snapshot.balance : null);
  const [interest, setInterest] = useState<Won | null>(snapshot?.interest_paid ?? null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  if (!latest) return null;
  const month = formatMonthOnly(latest.month);

  async function submit() {
    if (balance === null) {
      setError("남은 원금을 입력해 주세요.");
      return;
    }
    setSaving(true);
    const result = await mutate(
      () => saveLiabilitySnapshot(latest!.id, liability.id, snapshot, { balance, interest_paid: interest }),
      { success: `${month} 잔액을 저장했습니다` },
    );
    setSaving(false);
    if (result.ok) onOpenChange(false);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${liability.name} · ${month} 잔액`}
      description={`${month} 말 기준으로 적어 주세요.`}
      onSubmit={submit}
      footer={
        <>
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
        <FormField
          label="남은 원금"
          error={error}
          description={
            line ? (
              <>
                지난달 말 <Money amount={line.openBalance} /> · 예정 원금 상환 <Money amount={line.plannedPrincipal} />
              </>
            ) : undefined
          }
        >
          {(control) => <MoneyInput {...control} value={balance} onChange={setBalance} />}
        </FormField>
        <FormField
          label="이번 달 낸 이자·지급액"
          optional
          description={
            line && line.plannedInterest > 0 ? (
              <>
                예정 <Money amount={line.plannedInterest} /> · 비워 두면 미확인
              </>
            ) : (
              "비워 두면 미확인으로 남습니다."
            )
          }
        >
          {(control) => <MoneyInput {...control} value={interest} onChange={setInterest} />}
        </FormField>
      </div>
    </ResponsiveDialog>
  );
}
