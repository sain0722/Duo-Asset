import { addMonths, compareYm, diffMonths } from "@/lib/month";
import type { DebtPayment, Liability, ScheduleRow, Won, Ym } from "./types";

const NO_PAYMENT: DebtPayment = { principal: 0, interest: 0, payment: 0 };

/**
 * 한 달 이자 = round(남은 원금 × 연이율 ÷ 12).
 * 이율은 소수 3자리(%)까지이므로 1000배 정수로 바꿔 곱한 뒤 한 번만 나눈다.
 */
export function monthlyInterest(balance: Won, annualRatePct: number): Won {
  if (balance <= 0 || annualRatePct <= 0) return 0;
  const rateMilli = Math.round(annualRatePct * 1000);
  return Math.round((balance * rateMilli) / 1_200_000);
}

/** 원리금균등 월 납부액 (원 단위 반올림) */
export function amortizedPayment(principal: Won, annualRatePct: number, termMonths: number): Won {
  if (principal <= 0 || termMonths <= 0) return 0;
  const r = annualRatePct / 1200;
  if (r === 0) return Math.round(principal / termMonths);
  const growth = Math.pow(1 + r, termMonths);
  return Math.round((principal * r * growth) / (growth - 1));
}

/** 계약상 마지막 납부 월. 기간이나 시작 월이 없으면 null */
export function liabilityEndMonth(liability: Liability): Ym | null {
  if (!liability.start_month || !liability.term_months) return null;
  return addMonths(liability.start_month, liability.term_months - 1);
}

/**
 * 그 달의 예정 상환액. 월초 실제 잔액(openingBalance)을 기준으로 계산한다.
 * 규칙은 docs/finance-rules.md 7절.
 */
export function scheduledPayment(liability: Liability, month: Ym, openingBalance: Won): DebtPayment {
  if (openingBalance <= 0) return NO_PAYMENT;
  if (liability.start_month && compareYm(month, liability.start_month) < 0) return NO_PAYMENT;

  const rate = Number(liability.annual_rate);
  const term = liability.term_months;
  // 몇 번째 납부인가 (1부터). 시작 월이 없으면 알 수 없다.
  const nth = liability.start_month ? diffMonths(liability.start_month, month) + 1 : null;
  const isLast = nth !== null && term !== null && nth >= term;

  let principal = 0;
  let interest = 0;

  switch (liability.kind) {
    case "installment": {
      const perMonth =
        liability.monthly_payment ?? (term ? Math.round(liability.original_principal / term) : 0);
      // 마지막 회차에는 나누어떨어지지 않아 남은 몇 원까지 정리한다.
      // 시작 월을 몰라 회차를 셀 수 없을 때도, 이번에 내고 남는 돈이 반올림 끝수뿐이면 함께 정리한다.
      const residue = openingBalance - perMonth;
      const onlyRounding = term !== null && residue > 0 && residue < term;
      principal = isLast || onlyRounding ? openingBalance : Math.min(openingBalance, perMonth);
      break;
    }
    case "equal_principal": {
      interest = monthlyInterest(openingBalance, rate);
      if (term) {
        const perMonth = Math.round(liability.original_principal / term);
        principal = isLast ? openingBalance : Math.min(openingBalance, perMonth);
      }
      break;
    }
    case "amortized": {
      interest = monthlyInterest(openingBalance, rate);
      if (term) {
        // 남은 원금을 남은 회차에 나눠 갚는 금액. 금리가 바뀌거나 중도상환을 하면
        // 은행처럼 만기는 그대로 두고 월 납부액이 다시 계산된다.
        const remaining = nth !== null ? Math.max(term - nth + 1, 1) : null;
        const payment =
          remaining !== null
            ? amortizedPayment(openingBalance, rate, remaining)
            : amortizedPayment(liability.original_principal, rate, term);
        principal = isLast ? openingBalance : Math.min(openingBalance, Math.max(payment - interest, 0));
      }
      break;
    }
    case "bullet": {
      interest = monthlyInterest(openingBalance, rate);
      principal = isLast ? openingBalance : 0;
      break;
    }
    case "interest_only": {
      // 원금은 그대로. 매월 정해진 금액(없으면 이율로 계산한 이자)을 지급한다.
      interest = liability.monthly_payment ?? monthlyInterest(openingBalance, rate);
      break;
    }
  }

  return { principal, interest, payment: principal + interest };
}

/**
 * fromMonth 부터의 예정 상환 일정. 잔액이 0이 되면 끝난다.
 * 원금이 줄지 않는 부채(interest_only 등)는 maxMonths 까지만 만든다.
 */
export function buildSchedule(
  liability: Liability,
  fromMonth: Ym,
  openingBalance: Won,
  maxMonths = 600,
): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let balance = openingBalance;
  for (let i = 0; i < maxMonths && balance > 0; i++) {
    const month = addMonths(fromMonth, i);
    const pay = scheduledPayment(liability, month, balance);
    balance -= pay.principal;
    rows.push({ month, ...pay, balance });
  }
  return rows;
}

/** 예정대로 갚았을 때 잔액이 0이 되는 달. 끝나지 않으면 null */
export function payoffMonth(
  liability: Liability,
  fromMonth: Ym,
  openingBalance: Won,
  maxMonths = 600,
): Ym | null {
  if (openingBalance <= 0) return null;
  const rows = buildSchedule(liability, fromMonth, openingBalance, maxMonths);
  const last = rows[rows.length - 1];
  return last && last.balance === 0 ? last.month : null;
}
