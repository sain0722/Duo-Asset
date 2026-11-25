import { LIABILITY_KINDS } from "@/lib/finance/meta";
import type {
  ExpenseChangeParams,
  FutureEvent,
  HomeMoveInParams,
  HomeSaleParams,
  IncomeChangeParams,
  LoanPayoffParams,
  LoanParams,
  OneTimeParams,
  ParentalLeaveParams,
  Ym,
} from "@/lib/finance/types";
import { formatCompactWon, formatYm } from "@/lib/format";

/** 이벤트 목록 한 줄 요약. who 는 구성원 id(null = 공동)를 이름으로 바꾼다. */
export function describeEvent(
  event: FutureEvent,
  who: (memberId: string | null) => string,
  loanName: (id: string) => string,
): string {
  const until = (end: Ym | null) => (end ? ` · ${formatYm(end)}까지` : " · 계속");
  switch (event.kind) {
    case "income_change": {
      const p = event.params as IncomeChangeParams;
      return `${who(p.memberId)} 월 수입 ${formatCompactWon(p.monthlyDelta, { sign: true })}${until(p.endMonth)}`;
    }
    case "expense_change": {
      const p = event.params as ExpenseChangeParams;
      return `월 지출 ${formatCompactWon(p.monthlyDelta, { sign: true })}${until(p.endMonth)}`;
    }
    case "one_time": {
      const p = event.params as OneTimeParams;
      const amount = formatCompactWon(Math.abs(p.amount));
      if (p.asAsset) return p.amount < 0 ? `자산 취득 ${amount}` : `자산 매각 ${amount}`;
      return p.amount < 0 ? `지출 ${amount}` : `수입 ${amount}`;
    }
    case "loan": {
      const p = event.params as LoanParams;
      return `${formatCompactWon(p.principal)} · 연 ${p.annualRate}% · ${p.termMonths}개월 ${LIABILITY_KINDS[p.method].label}${p.toAsset ? " · 자산 취득" : ""}`;
    }
    case "home_move_in": {
      const p = event.params as HomeMoveInParams;
      const parts = [`잔금 ${formatCompactWon(p.balanceDue)}`];
      if (p.loanAmount > 0) parts.push(`대출 ${formatCompactWon(p.loanAmount)}`);
      if (p.depositReturn > 0) parts.push(`보증금 반환 ${formatCompactWon(p.depositReturn)}`);
      return parts.join(" · ");
    }
    case "home_sale": {
      const p = event.params as HomeSaleParams;
      const repay = p.repayLiabilityIds.map(loanName);
      return `매도 ${formatCompactWon(p.salePrice)}${repay.length ? ` · ${repay.join(", ")} 상환` : ""}`;
    }
    case "loan_payoff":
      return `${loanName((event.params as LoanPayoffParams).liabilityId)} 남은 원금 상환`;
    case "parental_leave": {
      const p = event.params as ParentalLeaveParams;
      const parts = [`${who(p.memberId)} ${p.leaveMonths}개월 휴직`];
      if (p.monthlyChildCost) parts.push(`육아비 월 ${formatCompactWon(p.monthlyChildCost)}`);
      return parts.join(" · ");
    }
  }
}
