"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { pocketName, workingMonth } from "@/lib/data/derive";
import { useHousehold, useMutate } from "@/lib/data/hooks";
import { deleteRow, insertRow, relinkEntries, updateRow } from "@/lib/data/mutations";
import { INCOME_TYPE_LABELS, memberIdOf, PLAN_KIND_LABELS, pocketOf } from "@/lib/finance/meta";
import type { IncomeType, MonthEntry, PlanItem, PlanItemKind, PocketId, Won, Ym } from "@/lib/finance/types";
import { JOINT } from "@/lib/finance/types";
import { formatMonthOnly, formatYm } from "@/lib/format";
import { addMonths, compareYm, currentYm } from "@/lib/month";
import { cn } from "@/lib/utils";

import { MonthSelect } from "./month-select";
import { canSplitAt, entriesToRelink, MONTH_NUMBERS, splitPlanItem } from "./plan-items";

const KIND_ORDER: PlanItemKind[] = ["income", "expense", "saving", "contribution", "benefit"];
const MEMBER_ONLY: PlanItemKind[] = ["contribution", "benefit"];
const INCOME_TYPES = (Object.keys(INCOME_TYPE_LABELS) as IncomeType[]).map((value) => ({
  value,
  label: value === "other" ? "기타" : INCOME_TYPE_LABELS[value],
}));

const DAY_LABEL: Record<PlanItemKind, string> = {
  income: "급여일",
  benefit: "지급일",
  expense: "납부일",
  saving: "이체일",
  contribution: "이체일",
};

type ChangeMode = "split" | "edit";

export type PlanItemDialogTarget =
  | { item: PlanItem }
  | { item: null; kind: PlanItemKind; pocket: PocketId };

type PlanItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: PlanItemDialogTarget;
  /** 화면에서 보고 있는 달. "○월부터 변경"의 기본 시작 월을 정한다. */
  viewedMonth: Ym;
};

/** 계획 항목 추가·수정. 열 때마다 key 를 바꿔 새로 마운트한다(폼 초기화). */
export function PlanItemDialog({ open, onOpenChange, target, viewedMonth }: PlanItemDialogProps) {
  const data = useHousehold();
  const mutate = useMutate();
  const item = target.item;

  const [kind, setKind] = useState<PlanItemKind>(item ? item.kind : target.kind);
  const [pocket, setPocket] = useState<PocketId>(item ? pocketOf(item.member_id) : target.pocket);
  const [name, setName] = useState(item?.name ?? "");
  const [amount, setAmount] = useState<Won | null>(item?.amount ?? null);
  const [incomeType, setIncomeType] = useState<IncomeType>(item?.income_type ?? "salary");
  const [payDay, setPayDay] = useState(item?.pay_day ? String(item.pay_day) : "");
  const [startMonth, setStartMonth] = useState<Ym | null>(item?.start_month ?? null);
  const [endMonth, setEndMonth] = useState<Ym | null>(item?.end_month ?? null);
  const [months, setMonths] = useState<number[]>(item?.months_of_year ?? []);
  const [assetId, setAssetId] = useState(item?.asset_id ?? "");
  const [memo, setMemo] = useState(item?.memo ?? "");
  const [active, setActive] = useState(item?.is_active ?? true);

  // "○월부터 변경": 마감한 달의 계획은 동결돼 있으므로, 이미 마감한 달이 있으면 정산 중인 달부터 바꾸는 것을 기본으로 한다.
  const openMonth = workingMonth(data)?.month ?? viewedMonth;
  const suggestedFrom = compareYm(viewedMonth, openMonth) > 0 ? viewedMonth : openMonth;
  const hasClosedMonth = data.months.some((month) => month.status === "closed");
  const [changeFrom, setChangeFrom] = useState<Ym>(suggestedFrom);
  const [changeMode, setChangeMode] = useState<ChangeMode>(
    item && hasClosedMonth && canSplitAt(item, suggestedFrom) ? "split" : "edit",
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteBlocked, setDeleteBlocked] = useState(false);

  const memberOnly = MEMBER_ONLY.includes(kind);
  const effectivePocket = memberOnly && pocket === JOINT ? data.members[0].id : pocket;
  const pocketOptions = [
    ...data.members.map((member) => ({ value: member.id, label: member.name })),
    { value: JOINT, label: "공동", disabled: memberOnly },
  ];

  // 저축 대상 자산은 같은 주머니의 자산만 (다른 주머니로 보내는 돈은 이동으로 기록한다)
  const owner = memberIdOf(effectivePocket);
  const assetOptions = data.assets.filter(
    (asset) => asset.owner_member_id === owner && (asset.is_active || asset.id === item?.asset_id),
  );
  const effectiveAssetId = assetOptions.some((asset) => asset.id === assetId) ? assetId : "";

  const amountChanged = item !== null && amount !== null && amount !== item.amount;
  const splittable = item !== null && canSplitAt(item, changeFrom);
  const showChangeMode = amountChanged && item !== null && canSplitAt(item, suggestedFrom);
  const splitting = showChangeMode && changeMode === "split";
  // 나누면 이 기록들(변경 시작 월 이후 열린 달에 이미 확인한 실제 값)을 새 항목에 다시 연결한다
  const recorded = item && splittable ? entriesToRelink(data, item.id, changeFrom) : [];

  const monthRangeFrom = addMonths(data.months[0]?.month ?? currentYm(), -12);
  const monthRangeTo = addMonths(currentYm(), 60);

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "이름을 입력해 주세요.";
    else if (name.trim().length > 60) next.name = "60자 이내로 입력해 주세요.";
    if (amount === null) next.amount = "금액을 입력해 주세요.";
    else if (amount < 0) next.amount = "0원 이상이어야 합니다.";
    if (!splitting && startMonth && endMonth && compareYm(startMonth, endMonth) > 0) {
      next.endMonth = "종료 월은 시작 월보다 빠를 수 없습니다.";
    }
    if (splitting) {
      if (!splittable) next.changeFrom = "이 항목이 적용되는 기간 안의 달을 골라 주세요.";
      else if (endMonth && compareYm(changeFrom, endMonth) > 0) next.endMonth = "종료 월은 변경 시작 월보다 빠를 수 없습니다.";
    }
    return next;
  }

  async function handleSubmit() {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // 종류는 실제 기록과 짝지어져 있어 수정할 때는 바꾸지 않는다
    const values = {
      member_id: memberIdOf(effectivePocket),
      name: name.trim(),
      amount: amount!,
      income_type: kind === "income" ? incomeType : null,
      pay_day: payDay ? Number(payDay) : null,
      start_month: startMonth,
      end_month: endMonth,
      months_of_year: months.length ? [...months].sort((a, b) => a - b) : null,
      asset_id: kind === "saving" && effectiveAssetId ? effectiveAssetId : null,
      memo: memo.trim(),
      is_active: active,
    } satisfies Partial<PlanItem>;

    setSaving(true);
    let result;
    if (!item) {
      const sortOrder = Math.max(0, ...data.planItems.map((p) => p.sort_order)) + 1;
      result = await mutate(() => insertRow<PlanItem>("plan_items", { ...values, kind, sort_order: sortOrder }), {
        success: "항목을 추가했습니다",
      });
    } else if (splitting) {
      const split = splitPlanItem(item, changeFrom);
      result = await mutate(
        async () => {
          const ended = await updateRow<PlanItem>("plan_items", item, split.endPrevious);
          let created: PlanItem | null = null;
          const moved: MonthEntry[] = [];
          try {
            created = await insertRow<PlanItem>("plan_items", {
              ...values,
              kind: item.kind,
              start_month: split.nextStart,
              sort_order: item.sort_order,
            });
            // 이미 확인한 실제 값이 옛 항목을 가리킨 채로 남으면 "계획에 없던 항목"으로 떨어져 두 번 잡힌다
            for (const entry of recorded) {
              await relinkEntries([entry], created.id);
              moved.push(entry);
            }
            return created;
          } catch (error) {
            // 하나라도 실패하면 처음 상태로 되돌린다. 되돌리지 못하면 반쯤 저장된 상태를 알린다.
            const restored = await undoSplit(item, ended, created, moved);
            if (!restored) {
              throw new Error("변경을 일부만 저장했습니다. 새로고침한 뒤 이 항목과 월 정산의 수입·지출을 확인해 주세요.");
            }
            throw error;
          }
        },
        { success: `${formatYm(changeFrom)}부터 바꿨습니다` },
      );
    } else {
      result = await mutate(() => updateRow<PlanItem>("plan_items", item, values), { success: "저장했습니다" });
    }
    setSaving(false);
    if (result.ok) onOpenChange(false);
  }

  async function handleDelete() {
    if (!item) return;
    const result = await mutate(
      async () => {
        try {
          await deleteRow("plan_items", item.id);
        } catch (error) {
          if (error instanceof Error && error.message.includes("보관")) {
            setDeleteBlocked(true);
            throw new Error("실제 금액이 기록된 항목이라 삭제할 수 없습니다. 종료 월을 정하거나 사용을 꺼 주세요.");
          }
          throw error;
        }
      },
      { success: "삭제했습니다" },
    );
    if (result.ok) onOpenChange(false);
  }

  const title = item ? `${PLAN_KIND_LABELS[item.kind]} 수정` : "계획 항목 추가";

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description={item ? `${pocketName(data, pocketOf(item.member_id))} · ${item.name}` : "매월 반복되는 돈의 흐름을 적어 주세요."}
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
          {!item && (
            <FormField label="종류">
              {(control) => (
                <NativeSelect {...control} value={kind} onChange={(event) => setKind(event.target.value as PlanItemKind)}>
                  {KIND_ORDER.map((value) => (
                    <option key={value} value={value}>
                      {PLAN_KIND_LABELS[value]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          )}

          <FormField
            label={kind === "income" ? "받는 사람" : "주머니"}
            description={
              kind === "benefit"
                ? "비현금 복지는 현금 수입에 들어가지 않습니다."
                : kind === "contribution"
                  ? "공용통장에 넣는 사람을 고릅니다."
                  : effectivePocket === JOINT
                    ? "공용통장에서 나가거나 들어오는 돈입니다."
                    : undefined
            }
          >
            {(_, { labelId }) => (
              <SegmentedControl
                aria-labelledby={labelId}
                fullWidth
                options={pocketOptions}
                value={effectivePocket}
                onValueChange={setPocket}
              />
            )}
          </FormField>

          {kind === "income" && (
            <FormField label="수입 유형">
              {(_, { labelId }) => (
                <SegmentedControl aria-labelledby={labelId} fullWidth options={INCOME_TYPES} value={incomeType} onValueChange={setIncomeType} />
              )}
            </FormField>
          )}

          <FormField label="이름" error={errors.name}>
            {(control) => (
              <Input {...control} value={name} maxLength={60} onChange={(event) => setName(event.target.value)} placeholder={namePlaceholder(kind)} />
            )}
          </FormField>

          <FormField label={kind === "benefit" ? "월 금액" : "금액"} error={errors.amount}>
            {(control) => <MoneyInput {...control} value={amount} onChange={setAmount} />}
          </FormField>

          {showChangeMode && (
            <div className="flex flex-col gap-3 rounded-xl bg-secondary/60 p-4">
              <FormField label="언제부터 바꿀까요?" error={errors.changeFrom}>
                {(_, { labelId }) => (
                  <SegmentedControl
                    aria-labelledby={labelId}
                    fullWidth
                    options={[
                      { value: "split", label: `${formatMonthOnly(changeFrom)}부터` },
                      { value: "edit", label: "처음부터 수정" },
                    ]}
                    value={changeMode}
                    onValueChange={setChangeMode}
                  />
                )}
              </FormField>
              {changeMode === "split" ? (
                <>
                  <FormField label="변경 시작 월">
                    {(control) => (
                      <MonthSelect {...control} value={changeFrom} onChange={(v) => v && setChangeFrom(v)} from={monthRangeFrom} to={monthRangeTo} />
                    )}
                  </FormField>
                  <p className="text-caption text-muted-foreground">
                    기존 금액은 {formatYm(addMonths(changeFrom, -1))}까지 유지하고, 새 금액을 {formatYm(changeFrom)}부터 적용합니다. 지난달 기록은 그대로입니다.
                    {recorded.length > 0 && ` ${formatMonthOnly(changeFrom)}부터 이미 확인한 실제 금액은 바뀐 항목으로 이어집니다.`}
                  </p>
                </>
              ) : (
                <p className="text-caption text-muted-foreground">
                  이 항목이 적용된 모든 열린 달과 앞으로의 계획이 새 금액으로 바뀝니다. 마감한 달의 결과는 바뀌지 않습니다.
                </p>
              )}
            </div>
          )}

          {kind === "saving" && (
            <FormField
              label="저축 대상 자산"
              optional
              description={
                assetOptions.length === 0
                  ? `${pocketName(data, effectivePocket)} 주머니에 등록된 자산이 없습니다.`
                  : "같은 주머니의 자산만 고를 수 있습니다."
              }
            >
              {(control) => (
                <NativeSelect {...control} value={effectiveAssetId} onChange={(event) => setAssetId(event.target.value)} disabled={assetOptions.length === 0}>
                  <option value="">정하지 않음</option>
                  {assetOptions.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          )}

          <FormField label={DAY_LABEL[kind]} optional>
            {(control) => (
              <NativeSelect {...control} value={payDay} onChange={(event) => setPayDay(event.target.value)}>
                <option value="">정하지 않음</option>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <option key={day} value={day}>
                    매월 {day}일
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            {!splitting && (
              <FormField label="시작 월" optional>
                {(control) => (
                  <MonthSelect {...control} value={startMonth} onChange={setStartMonth} from={monthRangeFrom} to={monthRangeTo} emptyLabel="처음부터" />
                )}
              </FormField>
            )}
            <FormField label="종료 월" optional error={errors.endMonth} className={cn(splitting && "col-span-2")}>
              {(control) => (
                <MonthSelect {...control} value={endMonth} onChange={setEndMonth} from={monthRangeFrom} to={monthRangeTo} emptyLabel="계속" />
              )}
            </FormField>
          </div>

          <FormField label="특정 월만" optional description={months.length ? undefined : "고르지 않으면 매월 적용됩니다. 상여금처럼 정해진 달에만 있는 돈에 씁니다."}>
            {(_, { labelId }) => (
              <div role="group" aria-labelledby={labelId} className="grid grid-cols-6 gap-1.5">
                {MONTH_NUMBERS.map((month) => {
                  const selected = months.includes(month);
                  return (
                    <button
                      key={month}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setMonths(selected ? months.filter((m) => m !== month) : [...months, month])}
                      className={cn(
                        "h-11 rounded-lg border text-sm font-medium tabular-nums transition-colors outline-none",
                        "focus-visible:ring-[3px] focus-visible:ring-ring/40",
                        selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {month}월
                    </button>
                  );
                })}
              </div>
            )}
          </FormField>

          <FormField label="메모" optional>
            {(control) => <Textarea {...control} value={memo} onChange={(event) => setMemo(event.target.value)} />}
          </FormField>

          {item && (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <label htmlFor="plan-item-active" className="text-sm font-medium">
                  사용
                </label>
                <p className="text-caption text-muted-foreground">끄면 모든 열린 달과 앞으로의 계획에서 빠집니다.</p>
              </div>
              <Switch id="plan-item-active" checked={active} onCheckedChange={setActive} />
            </div>
          )}

          {item && (
            <div className="flex flex-col items-start gap-2 border-t pt-4">
              {deleteBlocked && (
                <p role="status" className="text-caption text-warning-foreground">
                  실제 금액이 기록된 항목은 삭제할 수 없습니다. 종료 월을 정하거나 사용을 끄고 저장해 주세요.
                </p>
              )}
              <Button type="button" variant="ghost" className="-ml-3 text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                항목 삭제
              </Button>
            </div>
          )}
        </div>
      </ResponsiveDialog>

      {item && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`'${item.name}' 항목을 삭제할까요?`}
          description="모든 열린 달과 앞으로의 계획에서 사라집니다. 이미 마감한 달의 결과는 그대로입니다."
          confirmLabel="삭제"
          destructive
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}

/**
 * "○월부터 변경" 도중 실패했을 때 처음 상태로 되돌린다: 옮긴 실제 값을 옛 항목으로, 새 항목 삭제, 종료 월 복구.
 * 되돌리기까지 실패하면 false (화면에서 알린다).
 */
async function undoSplit(item: PlanItem, ended: PlanItem, created: PlanItem | null, moved: MonthEntry[]): Promise<boolean> {
  try {
    for (const entry of moved) {
      // 옮길 때 version 이 하나 올랐다 (bump_version 트리거)
      await updateRow<MonthEntry>("month_entries", { id: entry.id, version: entry.version + 1 }, { plan_item_id: item.id });
    }
    if (created) await deleteRow("plan_items", created.id);
    await updateRow<PlanItem>("plan_items", ended, { end_month: item.end_month });
    return true;
  } catch {
    return false;
  }
}

function namePlaceholder(kind: PlanItemKind): string {
  switch (kind) {
    case "income":
      return "예: 급여";
    case "benefit":
      return "예: 식비 카드";
    case "expense":
      return "예: 통신비";
    case "saving":
      return "예: 청약 저축";
    case "contribution":
      return "예: 공용통장 입금";
  }
}
