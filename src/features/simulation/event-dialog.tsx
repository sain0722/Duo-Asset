"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { useHousehold, useMutate } from "@/lib/data/hooks";
import { deleteRow, insertRow, updateRow } from "@/lib/data/mutations";
import { EVENT_KIND_LABELS, LIABILITY_KINDS } from "@/lib/finance/meta";
import type {
  FutureEvent,
  FutureEventKind,
  FutureEventParams,
  HomeMoveInParams,
  HomeSaleParams,
  IncomeChangeParams,
  LoanPayoffParams,
  LoanParams,
  OneTimeParams,
  ParentalLeaveParams,
  RepaymentMethod,
  Scenario,
  Won,
  Ym,
} from "@/lib/finance/types";
import { formatYm } from "@/lib/format";
import { addMonths } from "@/lib/month";

import { MonthPicker } from "./month-picker";

const KIND_ORDER: FutureEventKind[] = [
  "income_change",
  "expense_change",
  "one_time",
  "loan",
  "loan_payoff",
  "home_move_in",
  "home_sale",
  "parental_leave",
];
const METHODS: RepaymentMethod[] = ["amortized", "equal_principal", "bullet", "installment"];

const KIND_HINTS: Record<FutureEventKind, string> = {
  income_change: "이직·연봉 인상·퇴직처럼 월 수입이 바뀌는 일. 그 달부터 적용됩니다.",
  expense_change: "관리비·교육비처럼 매달 나가는 돈이 바뀌는 일.",
  one_time: "한 번 들어오거나 나가는 돈. 차량 구매처럼 자산이 생기면 '자산 취득'을 켜세요.",
  loan: "대출을 받는 달. 첫 납부는 다음 달부터입니다.",
  home_move_in: "입주하는 달에 분양 납부금이 부동산으로 바뀌고 잔금·대출·보증금 반환이 함께 반영됩니다.",
  home_sale: "갖고 있는 부동산 전체를 팔아 현금으로 받고, 고른 대출을 그 자리에서 갚습니다. 갈아타기는 주택 매도와 주택 입주를 함께 넣으세요.",
  loan_payoff: "남은 원금을 현금으로 한 번에 갚습니다. 예정대로 끝나는 대출은 넣지 않아도 됩니다.",
  parental_leave: "휴직 기간에는 그 사람의 수입이 휴직 중 수령액으로 바뀌고, 육아비는 계속 이어집니다.",
};

const MONTH_LABELS: Partial<Record<FutureEventKind, string>> = {
  one_time: "언제",
  loan: "대출 받는 달",
  loan_payoff: "갚는 달",
  home_move_in: "입주 월",
  home_sale: "매도 월",
  parental_leave: "휴직 시작 월",
};

/**
 * 폼 상태. 금액은 Won | null(빈칸), 이율·개월 수는 입력 중인 글자 그대로 둔다("3." 같은 중간 상태).
 * 저장할 때 types.ts 의 FutureEventParams 형태로 바꾼다.
 */
type Form = {
  memberId: string;
  /** 소득 변화 대상: 구성원 id 또는 "joint" */
  incomeTarget: string;
  monthlyDelta: Won | null;
  hasEnd: boolean;
  endMonth: Ym;
  direction: "out" | "in";
  amount: Won | null;
  asAsset: boolean;
  principal: Won | null;
  rate: string;
  term: string;
  method: RepaymentMethod;
  toAsset: boolean;
  balanceDue: Won | null;
  loanAmount: Won | null;
  depositReturn: Won | null;
  housingDelta: Won | null;
  leaveMonths: string;
  leaveIncome: Won | null;
  childCost: Won | null;
  oneTimeCost: Won | null;
  salePrice: Won | null;
  repayIds: string[];
  payoffId: string;
};

function initialForm(event: FutureEvent | null, defaultMember: string, month: Ym): Form {
  const form: Form = {
    memberId: defaultMember,
    incomeTarget: defaultMember,
    monthlyDelta: null,
    hasEnd: false,
    endMonth: addMonths(month, 11),
    direction: "out",
    amount: null,
    asAsset: false,
    principal: null,
    rate: "",
    term: "",
    method: "amortized",
    toAsset: false,
    balanceDue: null,
    loanAmount: null,
    depositReturn: null,
    housingDelta: null,
    leaveMonths: "12",
    leaveIncome: null,
    childCost: null,
    oneTimeCost: null,
    salePrice: null,
    repayIds: [],
    payoffId: "",
  };
  if (!event) return form;
  const p = event.params;
  switch (event.kind) {
    case "income_change": {
      const q = p as IncomeChangeParams;
      return { ...form, incomeTarget: q.memberId ?? "joint", monthlyDelta: q.monthlyDelta, hasEnd: q.endMonth !== null, endMonth: q.endMonth ?? form.endMonth };
    }
    case "expense_change": {
      const q = p as IncomeChangeParams;
      return { ...form, monthlyDelta: q.monthlyDelta, hasEnd: q.endMonth !== null, endMonth: q.endMonth ?? form.endMonth };
    }
    case "one_time": {
      const q = p as OneTimeParams;
      return { ...form, direction: q.amount < 0 ? "out" : "in", amount: Math.abs(q.amount), asAsset: q.asAsset };
    }
    case "loan": {
      const q = p as LoanParams;
      return { ...form, principal: q.principal, rate: String(q.annualRate), term: String(q.termMonths), method: q.method, toAsset: q.toAsset };
    }
    case "home_move_in": {
      const q = p as HomeMoveInParams;
      return {
        ...form,
        balanceDue: q.balanceDue,
        loanAmount: q.loanAmount,
        rate: String(q.loanRate),
        term: String(q.loanTermMonths),
        method: q.loanMethod,
        depositReturn: q.depositReturn,
        housingDelta: q.monthlyExpenseDelta,
      };
    }
    case "home_sale": {
      const q = p as HomeSaleParams;
      return { ...form, salePrice: q.salePrice, repayIds: q.repayLiabilityIds };
    }
    case "loan_payoff":
      return { ...form, payoffId: (p as LoanPayoffParams).liabilityId };
    case "parental_leave": {
      const q = p as ParentalLeaveParams;
      return {
        ...form,
        memberId: q.memberId,
        leaveMonths: String(q.leaveMonths),
        leaveIncome: q.monthlyIncomeDuringLeave,
        childCost: q.monthlyChildCost,
        oneTimeCost: q.oneTimeCost,
      };
    }
  }
}

type Errors = Partial<Record<string, string>>;

function toParams(kind: FutureEventKind, f: Form): { params?: FutureEventParams; errors: Errors } {
  const errors: Errors = {};
  const need = (key: string, value: Won | null, message = "금액을 입력해 주세요.") => {
    if (value === null) errors[key] = message;
    return value ?? 0;
  };
  const rate = (key: string) => {
    const value = Number(f.rate.replace(",", "."));
    if (f.rate.trim() === "" || !Number.isFinite(value) || value < 0 || value > 30) errors[key] = "0~30 사이 연 이율(%)을 입력해 주세요.";
    return value;
  };
  const months = (key: string, text: string, max: number) => {
    const value = Number(text);
    if (!Number.isInteger(value) || value < 1 || value > max) errors[key] = `1~${max} 사이 개월 수를 입력해 주세요.`;
    return value;
  };
  const end = f.hasEnd ? f.endMonth : null;

  let params: FutureEventParams | undefined;
  switch (kind) {
    case "income_change":
      params = { memberId: f.incomeTarget === "joint" ? null : f.incomeTarget, monthlyDelta: need("monthlyDelta", f.monthlyDelta), endMonth: end };
      break;
    case "expense_change":
      params = { monthlyDelta: need("monthlyDelta", f.monthlyDelta), endMonth: end };
      break;
    case "one_time": {
      const amount = need("amount", f.amount);
      params = { amount: f.direction === "out" ? -amount : amount, asAsset: f.asAsset };
      break;
    }
    case "loan":
      params = {
        principal: need("principal", f.principal),
        annualRate: f.method === "installment" ? 0 : rate("rate"),
        termMonths: months("term", f.term, 600),
        method: f.method,
        toAsset: f.toAsset,
      };
      break;
    case "home_move_in": {
      const loanAmount = f.loanAmount ?? 0;
      params = {
        balanceDue: need("balanceDue", f.balanceDue),
        loanAmount,
        loanRate: loanAmount > 0 && f.method !== "installment" ? rate("rate") : Number(f.rate) || 0,
        loanTermMonths: loanAmount > 0 ? months("term", f.term, 600) : Number(f.term) || 0,
        loanMethod: f.method,
        depositReturn: f.depositReturn ?? 0,
        monthlyExpenseDelta: f.housingDelta ?? 0,
      };
      break;
    }
    case "home_sale":
      params = { salePrice: need("salePrice", f.salePrice), repayLiabilityIds: f.repayIds };
      break;
    case "loan_payoff":
      if (!f.payoffId) errors.payoffId = "갚을 대출을 골라 주세요.";
      params = { liabilityId: f.payoffId };
      break;
    case "parental_leave":
      params = {
        memberId: f.memberId,
        leaveMonths: months("leaveMonths", f.leaveMonths, 36),
        monthlyIncomeDuringLeave: need("leaveIncome", f.leaveIncome, "휴직 중 받는 금액을 입력해 주세요. 없으면 0원."),
        monthlyChildCost: f.childCost ?? 0,
        oneTimeCost: f.oneTimeCost ?? 0,
      };
      break;
  }
  return Object.keys(errors).length > 0 || !params ? { errors } : { params, errors };
}

type EventDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null 이면 새 이벤트 */
  event: FutureEvent | null;
  scenario: Scenario;
  /** 새 이벤트의 기본 월 */
  defaultMonth: Ym;
};

export function EventDialog({ open, onOpenChange, event, scenario, defaultMonth }: EventDialogProps) {
  const data = useHousehold();
  const mutate = useMutate();
  const [name, setName] = useState(event?.name ?? "");
  const [kind, setKind] = useState<FutureEventKind>(event?.kind ?? "income_change");
  const [month, setMonth] = useState<Ym>(event?.month ?? defaultMonth);
  const [scope, setScope] = useState<"all" | "only">(event?.scenario_id ? "only" : "all");
  const [form, setForm] = useState<Form>(() => initialForm(event, data.me.id, event?.month ?? defaultMonth));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const memberOptions = data.members.map((m) => ({ value: m.id, label: m.name }));
  // 갚을 수 있는 대출: 등록한 부채 + 대출을 만드는 다른 이벤트
  const loanOptions = [
    ...data.liabilities.map((l) => ({ id: l.id, label: l.name })),
    ...data.events
      .filter((e) => e.id !== event?.id && (e.kind === "loan" || e.kind === "home_move_in"))
      .map((e) => ({ id: e.id, label: `${e.name} (${formatYm(e.month)} 이벤트)` })),
  ];

  async function handleSubmit() {
    const result = toParams(kind, form);
    const found = { ...result.errors, ...(name.trim() ? {} : { name: "이름을 입력해 주세요." }) };
    setErrors(found);
    if (!result.params || Object.keys(found).length > 0) return;

    const values = {
      name: name.trim(),
      kind,
      month,
      params: result.params,
      scenario_id: scope === "only" ? scenario.id : null,
    };
    setSaving(true);
    const saved = await mutate(
      () => (event ? updateRow<FutureEvent>("future_events", event, values) : insertRow<FutureEvent>("future_events", values)),
      { success: event ? "이벤트를 고쳤습니다" : "이벤트를 추가했습니다" },
    );
    setSaving(false);
    if (saved.ok) onOpenChange(false);
  }

  const money = (key: keyof Form, label: string, options: { allowNegative?: boolean; optional?: boolean; description?: string } = {}) => (
    <FormField label={label} optional={options.optional} description={options.description} error={errors[key]}>
      {(control) => (
        <MoneyInput
          {...control}
          allowNegative={options.allowNegative}
          value={form[key] as Won | null}
          onChange={(value) => set(key, value as never)}
        />
      )}
    </FormField>
  );
  const number = (key: "rate" | "term" | "leaveMonths", label: string, unit: string, decimal = false) => (
    <FormField label={label} error={errors[key]}>
      {(control) => (
        <div className="relative">
          <Input
            {...control}
            inputMode={decimal ? "decimal" : "numeric"}
            value={form[key]}
            onChange={(e) => set(key, e.target.value.replace(decimal ? /[^\d.,]/g : /\D/g, ""))}
            className="pr-12 tabular-nums"
          />
          <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted-foreground">{unit}</span>
        </div>
      )}
    </FormField>
  );
  const methodSelect = (
    <FormField label="상환 방식">
      {(control) => (
        <NativeSelect {...control} value={form.method} onChange={(e) => set("method", e.target.value as RepaymentMethod)}>
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {LIABILITY_KINDS[m].label}
            </option>
          ))}
        </NativeSelect>
      )}
    </FormField>
  );
  const switchRow = (key: "asAsset" | "toAsset" | "hasEnd", label: string, description?: string) => (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={`event-${key}`}>{label}</Label>
        {description && <p className="mt-0.5 text-caption text-muted-foreground">{description}</p>}
      </div>
      <Switch id={`event-${key}`} checked={form[key]} onCheckedChange={(checked) => set(key, checked)} />
    </div>
  );
  const endFields = (
    <>
      {switchRow("hasEnd", "끝나는 달 있음", form.hasEnd ? undefined : "끄면 기간 끝까지 계속 적용됩니다.")}
      {form.hasEnd && (
        <FormField label="이 달까지 적용">
          {(_, { labelId }) => <MonthPicker aria-labelledby={labelId} value={form.endMonth} onChange={(v) => set("endMonth", v)} />}
        </FormField>
      )}
    </>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={event ? "이벤트 수정" : "미래 이벤트 추가"}
      description="시뮬레이션에만 쓰는 가정입니다. 실제 기록은 바뀌지 않습니다."
      onSubmit={handleSubmit}
      footer={
        <>
          {event && (
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
        <FormField label="종류" description={KIND_HINTS[kind]}>
          {(control) => (
            <NativeSelect {...control} value={kind} onChange={(e) => setKind(e.target.value as FutureEventKind)}>
              {KIND_ORDER.map((k) => (
                <option key={k} value={k}>
                  {EVENT_KIND_LABELS[k]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>

        <FormField label="이름" error={errors.name}>
          {(control) => (
            <Input {...control} value={name} maxLength={60} placeholder="예: 이직, 차량 구매" onChange={(e) => setName(e.target.value)} />
          )}
        </FormField>

        <FormField label={MONTH_LABELS[kind] ?? "시작 월"}>
          {(_, { labelId }) => <MonthPicker aria-labelledby={labelId} value={month} onChange={setMonth} />}
        </FormField>

        {kind === "income_change" && (
          <>
            <FormField label="누구의 수입">
              {(_, { labelId }) => (
                <SegmentedControl
                  aria-labelledby={labelId}
                  fullWidth
                  options={[...memberOptions, { value: "joint", label: "공동" }]}
                  value={form.incomeTarget}
                  onValueChange={(v) => set("incomeTarget", v)}
                />
              )}
            </FormField>
            {money("monthlyDelta", "월 수입 증감", { allowNegative: true, description: "줄어들면 − 를 붙이세요." })}
            {endFields}
          </>
        )}

        {kind === "expense_change" && (
          <>
            {money("monthlyDelta", "월 지출 증감", { allowNegative: true, description: "줄어들면 − 를 붙이세요." })}
            {endFields}
          </>
        )}

        {kind === "one_time" && (
          <>
            <FormField label="방향">
              {(_, { labelId }) => (
                <SegmentedControl
                  aria-labelledby={labelId}
                  fullWidth
                  options={[
                    { value: "out", label: "나가는 돈" },
                    { value: "in", label: "들어오는 돈" },
                  ]}
                  value={form.direction}
                  onValueChange={(v) => set("direction", v)}
                />
              )}
            </FormField>
            {money("amount", "금액")}
            {form.direction === "out"
              ? switchRow("asAsset", "자산 취득", "차량처럼 돈이 자산으로 남으면 켜세요. 소비로 보지 않습니다.")
              : switchRow("asAsset", "자산 매각", "가진 자산을 팔아 받은 돈이면 켜세요. 수입으로 보지 않습니다.")}
          </>
        )}

        {kind === "loan" && (
          <>
            {money("principal", "대출 원금")}
            {methodSelect}
            <div className="grid grid-cols-2 gap-3">
              {form.method !== "installment" && number("rate", "연 이율", "%", true)}
              {number("term", "기간", "개월")}
            </div>
            {switchRow("toAsset", "자산 취득에 바로 사용", "끄면 대출금이 현금으로 들어옵니다.")}
          </>
        )}

        {kind === "home_move_in" && (
          <>
            {money("balanceDue", "잔금", { description: "입주할 때 내야 하는 금액 전체" })}
            {money("loanAmount", "주택담보대출", { optional: true, description: "잔금 중 대출로 내는 금액. 나머지는 현금에서 나갑니다." })}
            {(form.loanAmount ?? 0) > 0 && (
              <>
                {methodSelect}
                <div className="grid grid-cols-2 gap-3">
                  {form.method !== "installment" && number("rate", "연 이율", "%", true)}
                  {number("term", "기간", "개월")}
                </div>
              </>
            )}
            {money("depositReturn", "돌려받는 보증금", { optional: true })}
            {money("housingDelta", "월 주거비 증감", { optional: true, allowNegative: true, description: "월세가 없어지면 − 로 적으세요." })}
          </>
        )}

        {kind === "home_sale" && (
          <>
            {money("salePrice", "매도 대금", { description: "현금으로 들어오는 금액" })}
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-medium">함께 갚을 대출</legend>
              {loanOptions.length === 0 && <p className="text-caption text-muted-foreground">갚을 대출이 없습니다.</p>}
              {loanOptions.map((option) => (
                <label key={option.id} className="flex min-h-11 items-center gap-3 text-body">
                  <Checkbox
                    checked={form.repayIds.includes(option.id)}
                    onCheckedChange={(checked) =>
                      set("repayIds", checked ? [...form.repayIds, option.id] : form.repayIds.filter((id) => id !== option.id))
                    }
                  />
                  <span className="min-w-0 truncate">{option.label}</span>
                </label>
              ))}
            </fieldset>
          </>
        )}

        {kind === "loan_payoff" && (
          <FormField label="갚을 대출" error={errors.payoffId}>
            {(control) => (
              <NativeSelect {...control} value={form.payoffId} onChange={(e) => set("payoffId", e.target.value)}>
                <option value="">대출 선택</option>
                {loanOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        )}

        {kind === "parental_leave" && (
          <>
            <FormField label="휴직하는 사람">
              {(_, { labelId }) => (
                <SegmentedControl aria-labelledby={labelId} fullWidth options={memberOptions} value={form.memberId} onValueChange={(v) => set("memberId", v)} />
              )}
            </FormField>
            {number("leaveMonths", "휴직 기간", "개월")}
            {money("leaveIncome", "휴직 중 월 수령액", { description: "휴직 급여 등. 이 기간에는 그 사람의 수입을 대신합니다." })}
            {money("childCost", "월 육아비", { optional: true, description: "휴직이 끝나도 계속 이어집니다." })}
            {money("oneTimeCost", "출산 관련 일회성 비용", { optional: true })}
          </>
        )}

        <FormField label="적용 범위">
          {(_, { labelId }) => (
            <SegmentedControl
              aria-labelledby={labelId}
              fullWidth
              options={[
                { value: "all", label: "모든 시나리오" },
                { value: "only", label: "이 시나리오만" },
              ]}
              value={scope}
              onValueChange={setScope}
            />
          )}
        </FormField>
      </div>

      {event && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`'${event.name}' 이벤트를 삭제할까요?`}
          description={event.scenario_id ? "이 시나리오에서 사라집니다." : "모든 시나리오에서 사라집니다. 한 시나리오에서만 빼려면 목록에서 끄세요."}
          confirmLabel="삭제"
          destructive
          onConfirm={async () => {
            const result = await mutate(() => deleteRow("future_events", event.id), { success: "이벤트를 삭제했습니다" });
            if (result.ok) onOpenChange(false);
          }}
        />
      )}
    </ResponsiveDialog>
  );
}
