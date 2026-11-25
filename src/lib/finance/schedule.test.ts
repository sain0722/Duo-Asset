import { describe, expect, it } from "vitest";
import {
  amortizedPayment,
  buildSchedule,
  liabilityEndMonth,
  monthlyInterest,
  payoffMonth,
  scheduledPayment,
} from "./schedule";
import { liability } from "./testing";

describe("이자 계산", () => {
  it("남은 원금 × 연이율 ÷ 12 를 원 단위로 반올림한다", () => {
    expect(monthlyInterest(100_000_000, 4.8)).toBe(400_000);
    expect(monthlyInterest(123_456_789, 3.75)).toBe(Math.round((123_456_789 * 3.75) / 1200));
    expect(monthlyInterest(10_000_000, 0)).toBe(0);
    expect(monthlyInterest(0, 5)).toBe(0);
  });

  it("소수 이율에서도 부동소수점 오차가 없다", () => {
    // 0.1 + 0.2 류의 오차가 금액에 섞이지 않는지: 4.35% → 정수 연산
    expect(monthlyInterest(200_000_000, 4.35)).toBe(725_000);
    expect(monthlyInterest(1_000_000, 0.1)).toBe(83);
  });
});

describe("무이자 할부", () => {
  const loan = liability({
    kind: "installment",
    original_principal: 36_000_000,
    monthly_payment: 600_000,
    term_months: 60,
    start_month: "2025-01",
  });

  it("매월 고정 원금을 갚고 이자는 없다", () => {
    expect(scheduledPayment(loan, "2026-03", 27_000_000)).toEqual({ principal: 600_000, interest: 0, payment: 600_000 });
  });

  it("남은 원금이 월 납부액보다 적으면 남은 만큼만 낸다", () => {
    expect(scheduledPayment(loan, "2029-12", 250_000)).toEqual({ principal: 250_000, interest: 0, payment: 250_000 });
  });

  it("시작 월 이전과 완납 이후에는 납부액이 없다", () => {
    expect(scheduledPayment(loan, "2024-12", 36_000_000).payment).toBe(0);
    expect(scheduledPayment(loan, "2026-03", 0).payment).toBe(0);
  });

  it("월 납부액이 없으면 원금 ÷ 기간으로 계산한다", () => {
    const noPayment = { ...loan, monthly_payment: null };
    expect(scheduledPayment(noPayment, "2025-01", 36_000_000).principal).toBe(600_000);
  });

  it("끝나는 달을 알려 준다", () => {
    expect(payoffMonth(loan, "2026-03", 1_800_000)).toBe("2026-05");
    expect(liabilityEndMonth(loan)).toBe("2029-12");
  });
});

describe("원리금균등", () => {
  const loan = liability({
    kind: "amortized",
    original_principal: 100_000_000,
    annual_rate: 4.8,
    term_months: 240,
    start_month: "2026-01",
  });

  it("월 납부액이 일정하고 이자를 뺀 나머지가 원금이다", () => {
    const payment = amortizedPayment(100_000_000, 4.8, 240);
    expect(payment).toBe(648_957);
    const first = scheduledPayment(loan, "2026-01", 100_000_000);
    expect(first.interest).toBe(400_000);
    expect(first.principal).toBe(payment - 400_000);
    expect(first.payment).toBe(payment);
  });

  it("일정대로 내면 마지막 회차에 잔액이 정확히 0이 된다", () => {
    const rows = buildSchedule(loan, "2026-01", 100_000_000);
    expect(rows).toHaveLength(240);
    expect(rows.at(-1)!.balance).toBe(0);
    expect(rows.at(-1)!.month).toBe("2045-12");
    expect(rows.reduce((total, row) => total + row.principal, 0)).toBe(100_000_000);
  });

  it("중도상환하면 이후 이자가 줄고 더 일찍 끝난다", () => {
    const afterPrepay = scheduledPayment(loan, "2026-06", 50_000_000);
    expect(afterPrepay.interest).toBe(200_000);
    expect(payoffMonth(loan, "2026-06", 50_000_000)! < "2045-12").toBe(true);
  });

  it("이율이 0이면 원금을 기간으로 나눈다", () => {
    expect(amortizedPayment(12_000_000, 0, 12)).toBe(1_000_000);
  });
});

describe("원금균등", () => {
  const loan = liability({
    kind: "equal_principal",
    original_principal: 60_000_000,
    annual_rate: 6,
    term_months: 120,
    start_month: "2026-01",
  });

  it("매월 같은 원금에 남은 원금의 이자를 더한다", () => {
    expect(scheduledPayment(loan, "2026-01", 60_000_000)).toEqual({ principal: 500_000, interest: 300_000, payment: 800_000 });
    expect(scheduledPayment(loan, "2026-02", 59_500_000)).toEqual({ principal: 500_000, interest: 297_500, payment: 797_500 });
  });

  it("마지막 회차에 남은 원금을 모두 갚는다", () => {
    expect(scheduledPayment(loan, "2035-12", 512_345).principal).toBe(512_345);
    expect(buildSchedule(loan, "2026-01", 60_000_000).at(-1)!.balance).toBe(0);
  });
});

describe("만기일시상환", () => {
  const loan = liability({
    kind: "bullet",
    original_principal: 50_000_000,
    annual_rate: 3.6,
    term_months: 24,
    start_month: "2026-01",
  });

  it("만기 전에는 이자만, 만기에 원금 전액", () => {
    expect(scheduledPayment(loan, "2026-07", 50_000_000)).toEqual({ principal: 0, interest: 150_000, payment: 150_000 });
    expect(scheduledPayment(loan, "2027-12", 50_000_000)).toEqual({
      principal: 50_000_000,
      interest: 150_000,
      payment: 50_150_000,
    });
    expect(payoffMonth(loan, "2026-01", 50_000_000)).toBe("2027-12");
  });
});

describe("원금 유지 차용금", () => {
  const loan = liability({ kind: "interest_only", original_principal: 40_000_000, monthly_payment: 300_000 });

  it("원금은 그대로이고 매월 정액을 지급한다", () => {
    expect(scheduledPayment(loan, "2026-03", 40_000_000)).toEqual({ principal: 0, interest: 300_000, payment: 300_000 });
    expect(payoffMonth(loan, "2026-03", 40_000_000)).toBeNull();
  });

  it("월 지급액이 없으면 이율로 이자를 계산한다", () => {
    const byRate = { ...loan, monthly_payment: null, annual_rate: 3 };
    expect(scheduledPayment(byRate, "2026-03", 40_000_000).interest).toBe(100_000);
  });
});
