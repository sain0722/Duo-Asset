"use client";

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
import { createAssetWithSnapshot, updateRow } from "@/lib/data/mutations";
import { ASSET_KINDS, ASSET_KIND_ORDER, LIQUIDITY_LABELS, memberIdOf, pocketOf } from "@/lib/finance/meta";
import type { Asset, AssetKind, Liquidity, Won } from "@/lib/finance/types";
import { JOINT } from "@/lib/finance/types";
import { formatMonthOnly } from "@/lib/format";

const LIQUIDITY_OPTIONS = (["liquid", "short", "locked"] as const).map((value) => ({
  value,
  label: { liquid: "즉시 사용", short: "현금화 가능", locked: "장기" }[value],
}));

type Errors = Partial<Record<"name" | "value" | "principal", string>>;

/** 자산 추가(asset 없음) · 정보 수정(asset 있음). 금액 수정은 AssetValueDialog 에서 한다. */
export function AssetFormDialog({
  open,
  onOpenChange,
  asset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: Asset;
}) {
  const data = useHousehold();
  const mutate = useMutate();
  const latest = latestMonth(data);
  const isBaseline = latest !== null && previousMonth(data, latest) === null;
  const editing = asset !== undefined;

  const [name, setName] = useState(asset?.name ?? "");
  const [kind, setKind] = useState<AssetKind>(asset?.kind ?? "cash");
  const [owner, setOwner] = useState<string>(pocketOf(asset ? asset.owner_member_id : data.me.id));
  const [liquidity, setLiquidity] = useState<Liquidity>(asset?.liquidity ?? ASSET_KINDS.cash.defaultLiquidity);
  const [maturity, setMaturity] = useState(asset?.maturity_date ?? "");
  const [memo, setMemo] = useState(asset?.memo ?? "");
  const [value, setValue] = useState<Won | null>(null);
  const [principal, setPrincipal] = useState<Won | null>(null);
  const [existedBefore, setExistedBefore] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const valuation = ASSET_KINDS[kind].tracking === "valuation";
  const ownerOptions = [
    ...data.members.map((member) => ({ value: member.id, label: member.name })),
    { value: JOINT, label: "공동" },
  ];

  function changeKind(next: AssetKind) {
    setKind(next);
    setLiquidity(ASSET_KINDS[next].defaultLiquidity);
  }

  async function submit() {
    const next: Errors = {};
    if (!name.trim()) next.name = "이름을 입력해 주세요.";
    if (!editing && value === null) next.value = "현재 평가금액을 입력해 주세요.";
    if (!editing && valuation && principal === null) next.principal = "지금까지 넣은 돈을 입력해 주세요.";
    setErrors(next);
    if (Object.keys(next).length > 0 || !latest) return;

    const fields = {
      name: name.trim(),
      kind,
      owner_member_id: memberIdOf(owner),
      liquidity,
      maturity_date: maturity || null,
      memo: memo.trim(),
    };
    setSaving(true);
    const result = editing
      ? await mutate(() => updateRow<Asset>("assets", asset, fields), { success: "저장했습니다" })
      : await mutate(
          () =>
            createAssetWithSnapshot({
              asset: { ...fields, sort_order: Math.max(-1, ...data.assets.map((a) => a.sort_order)) + 1 },
              monthId: latest.id,
              value: value!,
              principal: valuation ? principal! : value!,
              existedBefore: !isBaseline && existedBefore,
            }),
          { success: "자산을 추가했습니다" },
        );
    setSaving(false);
    if (result.ok) onOpenChange(false);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "자산 정보 수정" : "자산 추가"}
      description={editing ? "금액은 ‘이번 달 값 수정’에서 바꿉니다." : undefined}
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
            <Input {...control} value={name} maxLength={60} placeholder="예: 비상금 예금" onChange={(e) => setName(e.target.value)} />
          )}
        </FormField>

        <FormField label="유형">
          {(control) => (
            <NativeSelect {...control} value={kind} onChange={(e) => changeKind(e.target.value as AssetKind)}>
              {ASSET_KIND_ORDER.map((option) => (
                <option key={option} value={option}>
                  {ASSET_KINDS[option].label}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>

        <FormField label="소유" description="공용통장 돈으로 붓는 자산은 명의와 관계없이 공동입니다.">
          {(_, { labelId }) => (
            <SegmentedControl
              aria-labelledby={labelId}
              fullWidth
              options={ownerOptions}
              value={owner}
              onValueChange={setOwner}
            />
          )}
        </FormField>

        <FormField label="유동성" description={LIQUIDITY_LABELS[liquidity]}>
          {(_, { labelId }) => (
            <SegmentedControl
              aria-labelledby={labelId}
              fullWidth
              options={LIQUIDITY_OPTIONS}
              value={liquidity}
              onValueChange={setLiquidity}
            />
          )}
        </FormField>

        {!editing && (
          <>
            <FormField
              label={valuation ? "현재 평가금액" : "현재 잔액"}
              error={errors.value}
              description={latest ? `${formatMonthOnly(latest.month)} 값으로 기록합니다.` : undefined}
            >
              {(control) => <MoneyInput {...control} value={value} onChange={setValue} />}
            </FormField>
            {valuation && (
              <FormField
                label="순투입액"
                error={errors.principal}
                description="투자원금·취득금액. 지금까지 넣은 돈 − 뺀 돈입니다."
              >
                {(control) => <MoneyInput {...control} value={principal} onChange={setPrincipal} />}
              </FormField>
            )}
          </>
        )}

        <FormField label="만기일" optional>
          {(control) => <Input {...control} type="date" value={maturity} onChange={(e) => setMaturity(e.target.value)} />}
        </FormField>

        <FormField label="메모" optional>
          {(control) => <Textarea {...control} value={memo} rows={2} onChange={(e) => setMemo(e.target.value)} />}
        </FormField>

        {!editing && !isBaseline && (
          <div className="flex items-start justify-between gap-4 rounded-xl bg-secondary/60 px-4 py-3.5">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="asset-existed-before">{existedBefore ? "전부터 갖고 있던 자산" : "이번 달에 새로 생긴 자산"}</Label>
              <p className="text-caption text-muted-foreground">
                {existedBefore
                  ? "이번 달 저축·소비 계산에 영향을 주지 않습니다."
                  : "이번 달에 넣은 돈으로 보고 저축에 반영합니다."}
              </p>
            </div>
            <Switch id="asset-existed-before" checked={existedBefore} onCheckedChange={setExistedBefore} className="mt-0.5" />
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
