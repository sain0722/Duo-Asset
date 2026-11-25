"use client";

import { Plus, X } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useState } from "react";

import { FormField } from "@/components/form-field";
import { Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { currentPosition } from "@/lib/data/derive";
import { useHousehold, useMutate } from "@/lib/data/hooks";
import { deleteRow, insertRow, updateRow } from "@/lib/data/mutations";
import { GOAL_BASIS_LABELS, LIQUIDITY_LABELS } from "@/lib/finance/meta";
import type { Goal, GoalAllocation, GoalBasis, Won } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

import { diffAllocations, nextSortOrder, type AllocationDraft } from "./goal-ops";

export type GoalPreset = { name: string; basis: GoalBasis };

const BASIS_ORDER: GoalBasis[] = ["linked", "manual", "net_worth", "liquid_assets", "financial_assets"];

const BASIS_DESCRIPTIONS: Record<GoalBasis, string> = {
  linked: "고른 자산에서 이 목표에 떼어 둔 금액을 셉니다.",
  manual: "모은 금액을 직접 적습니다.",
  net_worth: "가구 순자산(총자산 − 총부채) 전체를 봅니다.",
  liquid_assets: "즉시 쓸 수 있는 자산의 합. 다른 목표에 배정된 돈은 뺍니다.",
  financial_assets: "현금·예적금·투자·연금의 합. 다른 목표에 배정된 돈은 뺍니다.",
};

/** 시뮬레이션으로 달성 시점을 보는 기준 — 월 적립 계획을 쓰지 않는다 */
const PROJECTED: GoalBasis[] = ["net_worth", "financial_assets"];

type Row = AllocationDraft & { key: number };

type Errors = Partial<Record<"name" | "target" | "manual" | "allocations", string>>;

type GoalDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null 이면 새 목표 */
  goal: Goal | null;
  preset?: GoalPreset;
};

export function GoalDialog({ open, onOpenChange, goal, preset }: GoalDialogProps) {
  const data = useHousehold();
  const mutate = useMutate();
  const position = currentPosition(data);
  const existing = goal ? data.goalAllocations.filter((a) => a.goal_id === goal.id) : [];

  const [name, setName] = useState(goal?.name ?? preset?.name ?? "");
  const [target, setTarget] = useState<Won | null>(goal?.target_amount ?? null);
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? "");
  const [basis, setBasis] = useState<GoalBasis>(goal?.basis ?? preset?.basis ?? "linked");
  const [manual, setManual] = useState<Won | null>(goal?.manual_amount ?? null);
  const [monthly, setMonthly] = useState<Won | null>(goal?.monthly_contribution ?? null);
  const [memo, setMemo] = useState(goal?.memo ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    existing.map((a, index) => ({ key: index, assetId: a.asset_id, amount: a.amount })),
  );
  const [nextKey, setNextKey] = useState(existing.length);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const linkedIds = new Set(existing.map((a) => a.asset_id));
  // 보관한 자산이라도 이미 연결돼 있으면 고를 수 있게 남긴다
  const selectableAssets = data.assets.filter((asset) => asset.is_active || linkedIds.has(asset.id));

  function updateRowDraft(key: number, patch: Partial<AllocationDraft>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    const used = new Set(rows.map((row) => row.assetId));
    const free = selectableAssets.find((asset) => !used.has(asset.id));
    setRows((current) => [...current, { key: nextKey, assetId: free?.id ?? "", amount: null }]);
    setNextKey((key) => key + 1);
  }

  function validate(): Errors {
    const next: Errors = {};
    if (!name.trim()) next.name = "이름을 입력해 주세요.";
    if (target === null || target <= 0) next.target = "목표 금액을 입력해 주세요.";
    if (basis === "manual" && (manual === null || manual < 0)) next.manual = "지금까지 모은 금액을 입력해 주세요. 없으면 0원.";
    if (basis === "linked") {
      const ids = rows.map((row) => row.assetId);
      if (ids.some((id) => !id)) next.allocations = "연결할 자산을 골라 주세요.";
      else if (new Set(ids).size !== ids.length) next.allocations = "같은 자산을 두 번 연결할 수 없습니다.";
    }
    return next;
  }

  async function handleSubmit() {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const values = {
      name: name.trim(),
      target_amount: target!,
      target_date: targetDate || null,
      basis,
      manual_amount: basis === "manual" ? manual : null,
      monthly_contribution: PROJECTED.includes(basis) ? null : monthly,
      memo: memo.trim(),
    };
    // 기준이 '연결한 자산'이 아니면 배정은 계산에 쓰이지 않으므로 지운다
    const diff = diffAllocations(existing, basis === "linked" ? rows : []);

    setSaving(true);
    const result = await mutate(
      async () => {
        const saved = goal
          ? await updateRow<Goal>("goals", goal, values)
          : await insertRow<Goal>("goals", { ...values, sort_order: nextSortOrder(data.goals) });
        for (const row of diff.remove) await deleteRow("goal_allocations", row.id);
        for (const { row, amount } of diff.update) await updateRow<GoalAllocation>("goal_allocations", row, { amount });
        for (const draft of diff.insert) {
          await insertRow<GoalAllocation>("goal_allocations", {
            goal_id: saved.id,
            asset_id: draft.assetId,
            amount: draft.amount,
          });
        }
      },
      { success: goal ? "목표를 고쳤습니다" : "목표를 만들었습니다" },
    );
    setSaving(false);
    if (result.ok) onOpenChange(false);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? "목표 수정" : "목표 추가"}
      description="목표는 자산을 옮기지 않습니다. 어떤 돈을 무엇에 쓸지 정해 두는 것입니다."
      onSubmit={handleSubmit}
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
        <FormField label="이름" error={errors.name}>
          {(control) => (
            <Input {...control} value={name} maxLength={60} placeholder="예: 비상금" onChange={(e) => setName(e.target.value)} />
          )}
        </FormField>

        <FormField label="목표 금액" error={errors.target}>
          {(control) => <MoneyInput {...control} value={target} onChange={setTarget} />}
        </FormField>

        <FormField label="목표일" optional description="정하면 목표일까지 매달 얼마가 필요한지 알려 드려요.">
          {(control) => (
            <Input {...control} type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          )}
        </FormField>

        <FormField label="현재 금액을 셀 기준">
          {(_, { labelId }) => (
            <RadioGroupPrimitive.Root
              aria-labelledby={labelId}
              value={basis}
              onValueChange={(value) => setBasis(value as GoalBasis)}
              className="flex flex-col gap-2"
            >
              {BASIS_ORDER.map((value) => (
                <RadioGroupPrimitive.Item
                  key={value}
                  value={value}
                  className={cn(
                    "flex min-h-14 flex-col items-start justify-center rounded-xl border border-input px-3.5 py-2.5 text-left",
                    "transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    "data-[state=checked]:border-primary data-[state=checked]:bg-primary/[0.04]",
                  )}
                >
                  <span className="text-body font-semibold">{GOAL_BASIS_LABELS[value]}</span>
                  <span className="text-caption text-muted-foreground">{BASIS_DESCRIPTIONS[value]}</span>
                </RadioGroupPrimitive.Item>
              ))}
            </RadioGroupPrimitive.Root>
          )}
        </FormField>

        {basis === "linked" && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">연결할 자산</legend>
            {rows.length === 0 && (
              <p className="text-caption text-muted-foreground">
                연결한 자산이 없으면 현재 금액은 0원입니다. 여러 목표에 같은 자산을 연결하면 위에 있는 목표부터 필요한 만큼 배정됩니다.
              </p>
            )}
            {rows.map((row) => {
              const used = new Set(rows.filter((r) => r.key !== row.key).map((r) => r.assetId));
              const value = row.assetId ? (position.assetValues[row.assetId] ?? 0) : null;
              return (
                <div key={row.key} className="flex flex-col gap-2 rounded-xl border p-3">
                  <div className="flex items-center gap-2">
                    <NativeSelect
                      aria-label="자산"
                      value={row.assetId}
                      onChange={(e) => updateRowDraft(row.key, { assetId: e.target.value })}
                    >
                      <option value="">자산 선택</option>
                      {selectableAssets.map((asset) => (
                        <option key={asset.id} value={asset.id} disabled={used.has(asset.id)}>
                          {asset.name}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="연결 해제"
                      className="text-muted-foreground"
                      onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                  {value !== null && (
                    <p className="px-1 text-caption text-muted-foreground">
                      평가금액 <Money amount={value} compact /> ·{" "}
                      {LIQUIDITY_LABELS[data.assets.find((a) => a.id === row.assetId)?.liquidity ?? "locked"]}
                    </p>
                  )}
                  <SegmentedControl
                    aria-label="배정 방식"
                    fullWidth
                    options={[
                      { value: "rest", label: "필요한 만큼" },
                      { value: "amount", label: "금액 지정" },
                    ]}
                    value={row.amount === null ? "rest" : "amount"}
                    onValueChange={(mode) => updateRowDraft(row.key, { amount: mode === "rest" ? null : (value ?? 0) })}
                  />
                  {row.amount !== null && (
                    <MoneyInput
                      aria-label="배정 금액"
                      value={row.amount}
                      onChange={(amount) => updateRowDraft(row.key, { amount: amount ?? 0 })}
                    />
                  )}
                </div>
              );
            })}
            {errors.allocations && (
              <p role="alert" className="text-caption text-destructive">
                {errors.allocations}
              </p>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={addRow}
              disabled={rows.length >= selectableAssets.length}
              className="self-start"
            >
              <Plus aria-hidden />
              자산 연결
            </Button>
          </fieldset>
        )}

        {basis === "manual" && (
          <FormField label="지금까지 모은 금액" error={errors.manual}>
            {(control) => <MoneyInput {...control} value={manual} onChange={setManual} />}
          </FormField>
        )}

        {!PROJECTED.includes(basis) ? (
          <FormField label="월 적립 계획" optional description="넣으면 예상 달성 시점을 계산합니다.">
            {(control) => <MoneyInput {...control} value={monthly} onChange={setMonthly} />}
          </FormField>
        ) : (
          <p className="text-caption text-muted-foreground">
            예상 달성 시점은 기본 시나리오 시뮬레이션으로 계산합니다.
          </p>
        )}

        <FormField label="메모" optional>
          {(control) => <Textarea {...control} value={memo} rows={2} onChange={(e) => setMemo(e.target.value)} />}
        </FormField>
      </div>
    </ResponsiveDialog>
  );
}
