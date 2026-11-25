"use client";

import { useState } from "react";

import { FormField } from "@/components/form-field";
import { Delta, Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { latestMonth } from "@/lib/data/derive";
import { useHousehold, useMutate } from "@/lib/data/hooks";
import { saveAssetSnapshot, updateRow } from "@/lib/data/mutations";
import { EMPTY_MONTH_DATA } from "@/lib/data/types";
import { ASSET_KINDS } from "@/lib/finance/meta";
import type { Asset, AssetLine, Won } from "@/lib/finance/types";
import { formatMonthOnly } from "@/lib/format";
import { todayInSeoul } from "@/lib/month";

import { disposalSnapshot } from "./derive";

function useLatestSnapshot(asset: Asset) {
  const data = useHousehold();
  const latest = latestMonth(data);
  const snapshot = latest
    ? (data.monthData[latest.id] ?? EMPTY_MONTH_DATA).assetSnapshots.find((s) => s.asset_id === asset.id)
    : undefined;
  return { latest, snapshot };
}

function Footer({ onCancel, saving, label }: { onCancel: () => void; saving: boolean; label: string }) {
  return (
    <>
      <Button type="button" variant="secondary" size="lg" onClick={onCancel}>
        취소
      </Button>
      <Button type="submit" size="lg" loading={saving}>
        {label}
      </Button>
    </>
  );
}

/** 가장 최근 달의 값(스냅샷)을 기록·수정한다. 평가형은 평가금액과 순투입액을 함께. */
export function AssetValueDialog({
  open,
  onOpenChange,
  asset,
  line,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: Asset;
  line: AssetLine | null;
}) {
  const mutate = useMutate();
  const { latest, snapshot } = useLatestSnapshot(asset);
  const valuation = ASSET_KINDS[asset.kind].tracking === "valuation";

  // 이번 달 값을 확인하지 않았다면 평가금액은 비워 둔다 (지난달 값을 조용히 확정하지 않기 위해)
  const [value, setValue] = useState<Won | null>(snapshot ? snapshot.value : null);
  const [principal, setPrincipal] = useState<Won | null>(snapshot?.principal ?? line?.principal ?? null);
  const [valuedOn, setValuedOn] = useState(snapshot?.valued_on ?? "");
  const [errors, setErrors] = useState<{ value?: string; principal?: string; valuedOn?: string }>({});
  const [saving, setSaving] = useState(false);

  if (!latest) return null;
  const monthLabel = formatMonthOnly(latest.month);
  const today = todayInSeoul();

  async function submit() {
    const next: typeof errors = {};
    if (value === null) next.value = "금액을 입력해 주세요.";
    if (valuation && principal === null) next.principal = "순투입액을 입력해 주세요.";
    // 'YYYY-MM-DD' 는 문자열 비교로 날짜 순서가 맞다
    if (valuation && valuedOn && valuedOn > today) next.valuedOn = "오늘 이후 날짜는 고를 수 없습니다.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    const result = await mutate(
      () =>
        saveAssetSnapshot(latest!.id, asset.id, snapshot, {
          value: value!,
          principal: valuation ? principal! : value!,
          ...(valuation ? { valued_on: valuedOn || null } : {}),
        }),
      { success: `${monthLabel} 값을 저장했습니다` },
    );
    setSaving(false);
    if (result.ok) onOpenChange(false);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${asset.name} · ${monthLabel} 값`}
      description={
        snapshot?.opening_value != null
          ? "이번 달에 등록한 자산입니다. 처음 적은 월초 값은 그대로 두고 월말 값만 바꿉니다."
          : `${monthLabel} 말 기준 금액을 적어 주세요.`
      }
      onSubmit={submit}
      footer={<Footer onCancel={() => onOpenChange(false)} saving={saving} label="저장" />}
    >
      <div className="flex flex-col gap-5">
        <FormField
          label={valuation ? "평가금액" : "잔액"}
          error={errors.value}
          description={
            !snapshot && line ? (
              <>
                지난달 <Money amount={line.openValue} />
              </>
            ) : undefined
          }
        >
          {(control) => <MoneyInput {...control} value={value} onChange={setValue} />}
        </FormField>
        {valuation && (
          <FormField
            label="순투입액"
            error={errors.principal}
            description="이번 달에 더 넣었으면 더하고, 뺀 돈이 있으면 그만큼 줄여 주세요."
          >
            {(control) => <MoneyInput {...control} value={principal} onChange={setPrincipal} allowNegative />}
          </FormField>
        )}
        {valuation && (
          <FormField
            label="평가 기준일"
            optional
            error={errors.valuedOn}
            description="퇴직연금 분기 명세서처럼 월말 값이 아닐 때만 적어 주세요. 비우면 그 달 말일 기준입니다."
          >
            {(control) => (
              <Input {...control} type="date" value={valuedOn} max={today} onChange={(e) => setValuedOn(e.target.value)} />
            )}
          </FormField>
        )}
      </div>
    </ResponsiveDialog>
  );
}

/**
 * 해지·매각: 이번 달 값을 0으로 기록하고 보관한다.
 * 받은 금액만큼 순투입액을 줄여, 장부 금액과의 차이는 소비가 아니라 평가 변동이 되게 한다.
 */
export function AssetCloseDialog({
  open,
  onOpenChange,
  asset,
  line,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: Asset;
  line: AssetLine;
}) {
  const mutate = useMutate();
  const { latest, snapshot } = useLatestSnapshot(asset);
  const balance = ASSET_KINDS[asset.kind].tracking === "balance";
  const [received, setReceived] = useState<Won | null>(null);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  if (!latest) return null;
  const preview = received === null ? null : disposalSnapshot(asset.kind, line, received);

  async function submit() {
    if (received === null) {
      setError("받은 금액을 입력해 주세요.");
      return;
    }
    const values = disposalSnapshot(asset.kind, line, received);
    setSaving(true);
    const result = await mutate(
      async () => {
        await saveAssetSnapshot(latest!.id, asset.id, snapshot, { value: values.value, principal: values.principal });
        await updateRow<Asset>("assets", asset, { is_active: false });
      },
      { success: "해지·매각을 기록하고 보관했습니다" },
    );
    setSaving(false);
    if (result.ok) onOpenChange(false);
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${asset.name} 해지·매각`}
      description={`${formatMonthOnly(latest.month)} 값을 0원으로 기록하고 보관합니다.`}
      onSubmit={submit}
      footer={<Footer onCancel={() => onOpenChange(false)} saving={saving} label="해지·매각" />}
    >
      <div className="flex flex-col gap-5">
        <FormField label="받은 금액" error={error} description="세금·수수료를 빼고 실제로 들어온 돈">
          {(control) => <MoneyInput {...control} value={received} onChange={setReceived} />}
        </FormField>

        <dl className="flex flex-col gap-2.5 rounded-xl bg-secondary/60 px-4 py-3.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">월초 평가금액</dt>
            <dd className="font-semibold">
              <Money amount={line.openValue} />
            </dd>
          </div>
          {!balance && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">이번 달 평가 변동</dt>
              <dd className="font-semibold">{preview ? <Delta amount={preview.gain} /> : <Money amount={null} />}</dd>
            </div>
          )}
        </dl>

        <p className="text-caption leading-5 text-muted-foreground">
          받은 돈이 들어간 통장의 잔액도 이번 달 정산에서 함께 반영해 주세요.
          {balance && " 잔액보다 더 받은 이자는 정산에서 기타 수입으로 기록하면 소비가 정확해집니다."}
        </p>
      </div>
    </ResponsiveDialog>
  );
}
