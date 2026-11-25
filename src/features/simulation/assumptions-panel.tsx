"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import { InfoTip } from "@/components/info-tip";
import { Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import type { Assumptions, Won } from "@/lib/finance/types";
import { formatCompactWon } from "@/lib/format";
import { cn } from "@/lib/utils";

type PercentKey = "salaryGrowthPct" | "expenseGrowthPct" | "investReturnPct" | "cashReturnPct" | "realEstateGrowthPct";

const PERCENT_FIELDS: { key: PercentKey; label: string; min: number; max: number; step: number; info: string }[] = [
  { key: "salaryGrowthPct", label: "연봉 인상률", min: 0, max: 10, step: 0.5, info: "급여와 상여금이 매년 1월에 이 비율만큼 오릅니다. 계획 항목의 금액은 현재 가치로 봅니다." },
  { key: "expenseGrowthPct", label: "생활비 증가율", min: 0, max: 10, step: 0.5, info: "고정지출과 개인 사용 가능 금액이 매년 1월에 이 비율만큼 늘어납니다." },
  { key: "investReturnPct", label: "투자 수익률", min: -5, max: 15, step: 0.5, info: "주식·투자, 퇴직연금·연금 자산에 월초 잔액 기준으로 붙는 연 수익률입니다." },
  { key: "cashReturnPct", label: "현금 이자율", min: 0, max: 6, step: 0.1, info: "현금·입출금, 예금, 적금에 붙는 연 이자율입니다. 잔액이 음수면 붙지 않습니다." },
  { key: "realEstateGrowthPct", label: "부동산 상승률", min: -5, max: 10, step: 0.5, info: "부동산 평가금액의 연 상승률입니다." },
];

type AssumptionsPanelProps = {
  values: Assumptions;
  onChange: (patch: Partial<Assumptions>) => void;
  /** 비교용 기본 시나리오의 가정. 선택한 것이 기본이면 null */
  baseValues: Assumptions | null;
  /** 월 투자액을 비웠을 때 쓰는 계획값 */
  plannedInvestment: Won;
  dirty: boolean;
  changedCount: number;
};

export function AssumptionsPanel({ values, onChange, baseValues, plannedInvestment, dirty, changedCount }: AssumptionsPanelProps) {
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          가정
          <span className="text-caption font-normal text-muted-foreground" aria-live="polite">
            {dirty ? "저장 중…" : "자동 저장"}
          </span>
        </CardTitle>
        <CardDescription>이 시나리오에만 적용됩니다. 바꾸는 즉시 그래프에 반영되고, 손을 떼면 저장됩니다.</CardDescription>
      </CardHeader>
      <CardContent className="lg:hidden">
        <Button
          variant="secondary"
          className="w-full justify-between"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "가정 접기" : changedCount > 0 ? `가정 펼치기 · ${changedCount}개 바꿈` : "가정 펼치기"}
          <ChevronDown aria-hidden className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </CardContent>
      <CardContent id={contentId} className={cn("flex-col gap-6 lg:flex", open ? "flex" : "hidden")}>
        {PERCENT_FIELDS.map((field) => (
          <PercentField
            {...field}
            key={field.key}
            value={values[field.key]}
            baseValue={baseValues?.[field.key]}
            onChange={(value) => onChange({ [field.key]: value })}
          />
        ))}

        <FieldShell
          label="월 저축 조정액"
          info="기본 계획보다 매달 덜 쓰고 더 모을 금액입니다(+). 더 쓰면 − 로 적습니다. 생활비에서 빼서 계산합니다."
          aside={baseValues && baseValues.monthlySavingsAdjust !== values.monthlySavingsAdjust && (
            <>기본 계획 {formatCompactWon(baseValues.monthlySavingsAdjust, { sign: true })}</>
          )}
        >
          {(labelId) => (
            <>
              <Slider
                aria-labelledby={labelId}
                min={-2_000_000}
                max={2_000_000}
                step={50_000}
                value={[Math.max(-2_000_000, Math.min(2_000_000, values.monthlySavingsAdjust))]}
                onValueChange={([v]) => onChange({ monthlySavingsAdjust: v })}
              />
              <MoneyInput
                aria-labelledby={labelId}
                allowNegative
                value={values.monthlySavingsAdjust}
                onChange={(v) => onChange({ monthlySavingsAdjust: v ?? 0 })}
              />
            </>
          )}
        </FieldShell>

        <FieldShell
          label="월 투자액"
          info="매달 현금성 자산에서 투자자산으로 옮기는 금액입니다. 비우면 투자·연금 자산에 연결된 저축 계획 항목의 합을 씁니다."
          aside={
            values.monthlyInvestment !== null && (
              <Button variant="link" className="text-caption" onClick={() => onChange({ monthlyInvestment: null })}>
                계획대로
              </Button>
            )
          }
        >
          {(labelId) => (
            <>
              <MoneyInput
                aria-labelledby={labelId}
                value={values.monthlyInvestment}
                placeholder={`계획대로 ${formatCompactWon(plannedInvestment)}`}
                onChange={(v) => onChange({ monthlyInvestment: v })}
              />
              {values.monthlyInvestment === null && (
                <p className="text-caption text-muted-foreground">
                  지금은 계획대로 월 <Money amount={plannedInvestment} compact /> 를 씁니다.
                </p>
              )}
            </>
          )}
        </FieldShell>
      </CardContent>
    </Card>
  );
}

function FieldShell({
  label,
  info,
  aside,
  children,
}: {
  label: string;
  info: string;
  aside?: React.ReactNode;
  children: (labelId: string) => React.ReactNode;
}) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-sm font-medium">
          <span id={labelId}>{label}</span>
          <InfoTip title={label}>{info}</InfoTip>
        </span>
        {aside && <span className="text-caption text-muted-foreground tabular-nums">{aside}</span>}
      </div>
      {children(labelId)}
    </div>
  );
}

function PercentField({
  label,
  info,
  min,
  max,
  step,
  value,
  baseValue,
  onChange,
}: {
  label: string;
  info: string;
  min: number;
  max: number;
  step: number;
  value: number;
  baseValue?: number;
  onChange: (value: number) => void;
}) {
  // 입력 중인 글자("3.", "-")를 값과 따로 둔다
  const [draft, setDraft] = useState(String(value));
  const text = Number(draft) === value && draft.trim() !== "" ? draft : String(value);

  return (
    <FieldShell
      label={label}
      info={info}
      aside={baseValue !== undefined && baseValue !== value && <>기본 계획 {baseValue}%</>}
    >
      {(labelId) => (
        <div className="flex items-center gap-3">
          <Slider
            aria-labelledby={labelId}
            min={min}
            max={max}
            step={step}
            value={[Math.max(min, Math.min(max, value))]}
            onValueChange={([v]) => {
              const rounded = Math.round(v * 10) / 10;
              setDraft(String(rounded));
              onChange(rounded);
            }}
          />
          <div className="relative w-24 shrink-0">
            <Input
              aria-labelledby={labelId}
              inputMode="decimal"
              value={text}
              onChange={(e) => {
                const next = e.target.value.replace(/[^\d.\-−]/g, "").replace("−", "-");
                setDraft(next);
                const parsed = Number(next);
                if (next.trim() !== "" && Number.isFinite(parsed) && parsed >= -50 && parsed <= 100) onChange(parsed);
              }}
              className="pr-8 text-right tabular-nums"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">%</span>
          </div>
        </div>
      )}
    </FieldShell>
  );
}
