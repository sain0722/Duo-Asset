"use client";

import Link from "next/link";
import { useState } from "react";

import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { latestMonth, previousMonth } from "@/lib/data/derive";
import { useHousehold, useMutate } from "@/lib/data/hooks";
import { deleteRow, insertRow, saveLiabilitySnapshot, updateRow } from "@/lib/data/mutations";
import { LIABILITY_KINDS, LIABILITY_KIND_ORDER, memberIdOf, pocketOf } from "@/lib/finance/meta";
import type { Liability, LiabilityKind, Won } from "@/lib/finance/types";
import { JOINT } from "@/lib/finance/types";
import { formatMonthOnly } from "@/lib/format";
import { isYm } from "@/lib/month";

type Field = "name" | "principal" | "rate" | "term" | "start" | "monthly" | "day" | "balance";

/** 부채 추가(liability 없음) · 수정. 방식에 따라 필요한 칸만 보여 준다. */
export function LiabilityFormDialog({
  open,
  onOpenChange,
  liability,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  liability?: Liability;
}) {
  const data = useHousehold();
  const mutate = useMutate();
  const latest = latestMonth(data);
  const isBaseline = latest !== null && previousMonth(data, latest) === null;
  const editing = liability !== undefined;

  const [name, setName] = useState(liability?.name ?? "");
  const [kind, setKind] = useState<LiabilityKind>(liability?.kind ?? "installment");
  const [payer, setPayer] = useState<string>(pocketOf(liability ? liability.payer_member_id : data.me.id));
  const [original, setOriginal] = useState<Won | null>(liability?.original_principal ?? null);
  const [rate, setRate] = useState(liability && liability.annual_rate > 0 ? String(liability.annual_rate) : "");
  const [term, setTerm] = useState(liability?.term_months ? String(liability.term_months) : "");
  const [start, setStart] = useState(liability?.start_month ?? "");
  const [monthly, setMonthly] = useState<Won | null>(liability?.monthly_payment ?? null);
  const [day, setDay] = useState(liability?.payment_day ? String(liability.payment_day) : "");
  const [account, setAccount] = useState(liability?.withdraw_asset_id ?? "");
  const [memo, setMemo] = useState(liability?.memo ?? "");
  const [balance, setBalance] = useState<Won | null>(null);
  const [existedBefore, setExistedBefore] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saving, setSaving] = useState(false);

  const meta = LIABILITY_KINDS[kind];
  const showStart = kind !== "interest_only";
  const payerOptions = [
    ...data.members.map((member) => ({ value: member.id, label: member.name })),
    { value: JOINT, label: "공용통장" },
  ];
  const accounts = data.assets.filter((asset) => asset.is_active || asset.id === account);

  function validate() {
    const next: Partial<Record<Field, string>> = {};
    if (!name.trim()) next.name = "이름을 입력해 주세요.";
    if (original === null || original <= 0) next.principal = "처음 빌린 원금을 입력해 주세요.";
    const rateValue = rate.trim() === "" ? 0 : Number(rate);
    if (meta.needsRate && (rate.trim() === "" || !Number.isFinite(rateValue) || rateValue < 0 || rateValue >= 100)) {
      next.rate = "0 이상 100 미만의 연 이율을 입력해 주세요.";
    }
    const termValue = term.trim() === "" ? null : Number(term);
    if (termValue !== null && (!Number.isInteger(termValue) || termValue <= 0)) next.term = "개월 수를 정수로 입력해 주세요.";
    if (kind !== "installment" && meta.needsTerm && termValue === null) next.term = "기간을 입력해 주세요.";
    if (start && !isYm(start)) next.start = "첫 납부 월을 다시 골라 주세요.";
    if (meta.needsStart && !start) next.start = "첫 납부 월을 입력해 주세요.";
    if (kind === "installment" && monthly === null && termValue === null) next.monthly = "월 납부액이나 기간 중 하나를 입력해 주세요.";
    if (kind === "interest_only" && monthly === null) next.monthly = "매월 드리는 금액을 입력해 주세요.";
    const dayValue = day.trim() === "" ? null : Number(day);
    if (dayValue !== null && (!Number.isInteger(dayValue) || dayValue < 1 || dayValue > 31)) next.day = "1~31 사이로 입력해 주세요.";
    if (!editing && balance === null) next.balance = "현재 남은 원금을 입력해 주세요.";
    setErrors(next);
    if (Object.keys(next).length > 0) return null;
    return {
      name: name.trim(),
      kind,
      payer_member_id: memberIdOf(payer),
      original_principal: original!,
      // 방식에 쓰이지 않는 값은 남기지 않는다 (방식을 바꿨을 때 예전 값이 계산에 끼지 않게)
      annual_rate: meta.needsRate ? rateValue : 0,
      term_months: meta.needsTerm ? termValue : null,
      start_month: showStart && start ? start : null,
      monthly_payment: meta.needsMonthlyPayment ? monthly : null,
      payment_day: dayValue,
      withdraw_asset_id: account || null,
      memo: memo.trim(),
    };
  }

  async function submit() {
    const fields = validate();
    if (!fields || !latest) return;
    setSaving(true);
    const result = editing
      ? await mutate(() => updateRow<Liability>("liabilities", liability, fields), { success: "저장했습니다" })
      : await mutate(
          async () => {
            const created = await insertRow<Liability>("liabilities", {
              ...fields,
              sort_order: Math.max(-1, ...data.liabilities.map((l) => l.sort_order)) + 1,
            });
            try {
              await saveLiabilitySnapshot(latest.id, created.id, undefined, {
                balance: balance!,
                // 전부터 있던 부채: 월초 잔액도 같은 값으로 적어 이번 달 차입·상환으로 잡히지 않게 한다 (기초 조정)
                opening_balance: !isBaseline && existedBefore ? balance! : null,
              });
            } catch (error) {
              await deleteRow("liabilities", created.id).catch(() => undefined);
              throw error;
            }
          },
          { success: "부채를 추가했습니다" },
        );
    setSaving(false);
    if (result.ok) onOpenChange(false);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "부채 수정" : "부채 추가"}
      description={
        editing ? undefined : (
          <>
            원금이 없는 정기 지급은{" "}
            <Link href="/plan" className="font-medium text-brand underline-offset-4 hover:underline">
              고정지출
            </Link>
            로 등록해 주세요.
          </>
        )
      }
      onSubmit={submit}
      footer={
        <>
          <Button type="button" variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button type="submit" size="lg" loading={saving}>
            {editing ? "저장" : "추가"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormField label="이름" error={errors.name}>
          {(control) => (
            <Input {...control} value={name} maxLength={60} placeholder="예: 자동차 할부" onChange={(e) => setName(e.target.value)} />
          )}
        </FormField>

        <FormField label="상환 방식" description={meta.description}>
          {(control) => (
            <NativeSelect {...control} value={kind} onChange={(e) => setKind(e.target.value as LiabilityKind)}>
              {LIABILITY_KIND_ORDER.map((option) => (
                <option key={option} value={option}>
                  {LIABILITY_KINDS[option].label}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>

        <FormField label="납부 담당">
          {(_, { labelId }) => (
            <SegmentedControl aria-labelledby={labelId} fullWidth options={payerOptions} value={payer} onValueChange={setPayer} />
          )}
        </FormField>

        <FormField label="최초 원금" error={errors.principal}>
          {(control) => <MoneyInput {...control} value={original} onChange={setOriginal} />}
        </FormField>

        {!editing && (
          <FormField
            label="현재 남은 원금"
            error={errors.balance}
            description={latest ? `${formatMonthOnly(latest.month)} 말 잔액으로 기록합니다.` : undefined}
          >
            {(control) => <MoneyInput {...control} value={balance} onChange={setBalance} />}
          </FormField>
        )}

        {meta.needsRate && (
          <FormField label="연 이율" error={errors.rate}>
            {(control) => (
              <div className="relative">
                <Input {...control} inputMode="decimal" value={rate} placeholder="예: 4.25" className="pr-9" onChange={(e) => setRate(e.target.value)} />
                <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted-foreground">%</span>
              </div>
            )}
          </FormField>
        )}

        {(meta.needsTerm || showStart) && (
          <div className="grid grid-cols-2 gap-3">
            {meta.needsTerm && (
              <FormField label="기간" error={errors.term} optional={kind === "installment"}>
                {(control) => (
                  <div className="relative">
                    <Input {...control} inputMode="numeric" value={term} placeholder="60" className="pr-12" onChange={(e) => setTerm(e.target.value)} />
                    <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted-foreground">개월</span>
                  </div>
                )}
              </FormField>
            )}
            {showStart && (
              <FormField label="첫 납부 월" error={errors.start} optional={!meta.needsStart}>
                {(control) => <Input {...control} type="month" value={start} onChange={(e) => setStart(e.target.value)} />}
              </FormField>
            )}
          </div>
        )}

        {meta.needsMonthlyPayment && (
          <FormField
            label={kind === "interest_only" ? "매월 지급액" : "월 납부액"}
            error={errors.monthly}
            optional={kind === "installment"}
            description={kind === "interest_only" ? "이자·용돈처럼 원금이 줄지 않는 지급" : "비우면 최초 원금 ÷ 기간"}
          >
            {(control) => <MoneyInput {...control} value={monthly} onChange={setMonthly} />}
          </FormField>
        )}

        <div className="grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)] gap-3">
          <FormField label="납부일" error={errors.day} optional>
            {(control) => <Input {...control} inputMode="numeric" value={day} placeholder="10" onChange={(e) => setDay(e.target.value)} />}
          </FormField>
          <FormField label="출금 계좌" optional>
            {(control) => (
              <NativeSelect {...control} value={account} onChange={(e) => setAccount(e.target.value)}>
                <option value="">선택 안 함</option>
                {accounts.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </div>

        <FormField label="메모" optional>
          {(control) => <Textarea {...control} value={memo} rows={2} onChange={(e) => setMemo(e.target.value)} />}
        </FormField>

        {!editing && !isBaseline && (
          <div className="flex items-start justify-between gap-4 rounded-xl bg-secondary/60 px-4 py-3.5">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="liability-existed-before">{existedBefore ? "전부터 있던 부채" : "이번 달에 새로 빌린 돈"}</Label>
              <p className="text-caption text-muted-foreground">
                {existedBefore ? "이번 달 저축·소비 계산에 영향을 주지 않습니다." : "이번 달 신규 차입으로 계산합니다."}
              </p>
            </div>
            <Switch id="liability-existed-before" checked={existedBefore} onCheckedChange={setExistedBefore} className="mt-0.5" />
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
