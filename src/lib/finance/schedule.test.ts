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

  it("원금이 기간으로 나누어떨어지지 않아도 계약 기간 안에 끝난다", () => {
    // 1,000만 원 ÷ 36개월 = 277,778원(반올림) → 마지막 회차에 남은 금액을 정리
    const odd = liability({ kind: "installment", original_principal: 10_000_000, term_months: 36, start_month: "2026-01" });
    const rows = buildSchedule(odd, "2026-01", 10_000_000);
    expect(rows).toHaveLength(36);
    expect(rows.at(-1)!.month).toBe(liabilityEndMonth(odd));
    expect(rows.at(-1)!.balance).toBe(0);
    expect(rows.reduce((total, row) => total + row.principal, 0)).toBe(10_000_000);
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

  it("중도상환하면 만기는 그대로이고 월 납부액과 이자가 줄어든다", () => {
    // 6번째 달에 잔액이 5천만 원으로 줄었다 (남은 235회차에 다시 나눈다)
    const afterPrepay = scheduledPayment(loan, "2026-06", 50_000_000);
    expect(afterPrepay.interest).toBe(200_000);
    expect(afterPrepay.payment).toBe(amortizedPayment(50_000_000, 4.8, 235));
    expect(afterPrepay.payment).toBeLessThan(amortizedPayment(100_000_000, 4.8, 240));
    expect(payoffMonth(loan, "2026-06", 50_000_000)).toBe("2045-12");
  });

  it("금리가 바뀌어도 남은 원금을 남은 기간에 맞춰 갚아 만기에 정확히 끝난다", () => {
    const changed = { ...loan, annual_rate: 3.2 };
    const rows = buildSchedule(changed, "2028-01", 93_000_000);
    expect(rows.at(-1)!.month).toBe("2045-12");
    expect(rows.at(-1)!.balance).toBe(0);
    // 마지막 달에 원금이 한꺼번에 몰리지 않는다
    expect(rows.at(-1)!.payment).toBeLessThan(rows[0].payment * 1.01);
  });

  it("첫 납부 월을 몰라도 원금을 0으로 두지 않는다", () => {
    const noStart = { ...loan, start_month: null };
    const pay = scheduledPayment(noStart, "2026-01", 100_000_000);
    expect(pay.principal).toBe(amortizedPayment(100_000_000, 4.8, 240) - 400_000);
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

// ───────────────────────── 추가 고정: 반올림 방향과 일정의 경계 ─────────────────────────

describe("반올림 방향 (7절: 이자는 round(남은 원금 × r))", () => {
  it("한 달 이자는 0.5원에서 올리고 0.5원 미만은 버린다", () => {
    // 100원 × 6% ÷ 12 = 0.5원 → 1원 (버림이면 0원)
    expect(monthlyInterest(100, 6)).toBe(1);
    // 300원 × 6% ÷ 12 = 1.5원 → 2원
    expect(monthlyInterest(300, 6)).toBe(2);
    // 250원 × 6% ÷ 12 = 1.25원 → 1원 (올림이면 2원)
    expect(monthlyInterest(250, 6)).toBe(1);
    // 100만 원 × 4.7% ÷ 12 = 3,916.67원 → 3,917원
    expect(monthlyInterest(1_000_000, 4.7)).toBe(3_917);
  });

  it("이율은 소수 3자리(%)까지 그대로 반영한다", () => {
    // 1억 2,000만 × 3.125% ÷ 12 = 312,500
    expect(monthlyInterest(120_000_000, 3.125)).toBe(312_500);
    // 1억 × 4.999% ÷ 12 = 416,583.33…
    expect(monthlyInterest(100_000_000, 4.999)).toBe(416_583);
  });

  it("이율을 정수로 바꿀 때 부동소수점 오차로 0.001%p 가 깎이지 않는다", () => {
    // 4.02 × 1000 = 4019.9999999999995, 2.01 × 1000 = 2009.9999999999998 (버리면 이자가 100원 줄어든다)
    expect(monthlyInterest(120_000_000, 4.02)).toBe(402_000);
    expect(monthlyInterest(120_000_000, 2.01)).toBe(201_000);
  });

  it("원금균등의 월 원금은 round(최초 원금 ÷ 기간)이다", () => {
    const up = liability({ kind: "equal_principal", original_principal: 10_000_000, annual_rate: 6, term_months: 36, start_month: "2026-01" });
    // 1,000만 ÷ 36 = 277,777.78 → 277,778 (버림이면 277,777)
    expect(scheduledPayment(up, "2026-01", 10_000_000)).toEqual({ principal: 277_778, interest: 50_000, payment: 327_778 });
    const down = { ...up, term_months: 30 };
    // 1,000만 ÷ 30 = 333,333.33 → 333,333 (올림이면 333,334)
    expect(scheduledPayment(down, "2026-01", 10_000_000).principal).toBe(333_333);
  });

  it("무이자 할부도 월 납부액이 없으면 round(최초 원금 ÷ 기간)이다", () => {
    const up = liability({ kind: "installment", original_principal: 10_000_000, term_months: 36, start_month: "2026-01" });
    expect(scheduledPayment(up, "2026-01", 10_000_000)).toEqual({ principal: 277_778, interest: 0, payment: 277_778 });
    expect(scheduledPayment({ ...up, term_months: 30 }, "2026-01", 10_000_000).principal).toBe(333_333);
  });

  it("원리금균등 월 납부액은 원 단위에서 반올림한다 (고정밀 계산과 대조한 기준값)", () => {
    // 괄호 안은 반올림 전 값
    expect(amortizedPayment(300_000_000, 4.2, 360)).toBe(1_467_052); // 1,467,051.52
    expect(amortizedPayment(200_000_000, 3.5, 240)).toBe(1_159_919); // 1,159,919.44
    expect(amortizedPayment(50_000_000, 6.5, 60)).toBe(978_307); // 978,307.41
    expect(amortizedPayment(100_000_000, 5, 120)).toBe(1_060_655); // 1,060,655.15
    expect(amortizedPayment(10_000_000, 12, 12)).toBe(888_488); // 888,487.89
    expect(amortizedPayment(150_000_000, 3.85, 300)).toBe(779_385); // 779,384.74
    expect(amortizedPayment(30_000_000, 7.9, 36)).toBe(938_708); // 938,707.62
    expect(amortizedPayment(500_000_000, 2.75, 480)).toBe(1_718_639); // 1,718,638.97
    expect(amortizedPayment(1_000_000, 10, 3)).toBe(338_904); // 338,904.26
  });

  it("이율이 0인 원리금균등은 round(원금 ÷ 기간)이고, 원금이나 기간이 없으면 0이다", () => {
    expect(amortizedPayment(10_000_000, 0, 36)).toBe(277_778);
    expect(amortizedPayment(10_000_000, 0, 30)).toBe(333_333);
    expect(amortizedPayment(0, 5, 12)).toBe(0);
    expect(amortizedPayment(10_000_000, 5, 0)).toBe(0);
  });
});

describe("부채 일정의 경계 (7절)", () => {
  it("기간이 지났는데 잔액이 남아 있으면 그 달에 남은 원금을 모두 갚는 것으로 본다", () => {
    const amortized = liability({ kind: "amortized", original_principal: 100_000_000, annual_rate: 4.8, term_months: 240, start_month: "2026-01" });
    // 241번째 달: 이자 300만 × 4.8% ÷ 12 = 12,000
    expect(scheduledPayment(amortized, "2046-01", 3_000_000)).toEqual({ principal: 3_000_000, interest: 12_000, payment: 3_012_000 });

    const equal = liability({ kind: "equal_principal", original_principal: 60_000_000, annual_rate: 6, term_months: 120, start_month: "2026-01" });
    expect(scheduledPayment(equal, "2036-03", 2_000_000)).toEqual({ principal: 2_000_000, interest: 10_000, payment: 2_010_000 });

    const bullet = liability({ kind: "bullet", original_principal: 50_000_000, annual_rate: 3.6, term_months: 24, start_month: "2026-01" });
    expect(scheduledPayment(bullet, "2028-02", 50_000_000)).toEqual({ principal: 50_000_000, interest: 150_000, payment: 50_150_000 });

    const installment = liability({ kind: "installment", original_principal: 36_000_000, monthly_payment: 600_000, term_months: 60, start_month: "2025-01" });
    expect(scheduledPayment(installment, "2030-02", 1_500_000)).toEqual({ principal: 1_500_000, interest: 0, payment: 1_500_000 });
  });

  it("원리금균등은 잔액이 최초 원금보다 커도 남은 원금을 남은 회차에 나눈다", () => {
    const loan = liability({ kind: "amortized", original_principal: 100_000_000, annual_rate: 4.8, term_months: 240, start_month: "2026-01" });
    // 3번째 달, 잔액 1억 2,000만, 남은 238회차: 월 납부액 782,653.71 → 782,654, 이자 48만
    expect(scheduledPayment(loan, "2026-03", 120_000_000)).toEqual({ principal: 302_654, interest: 480_000, payment: 782_654 });
  });

  it("원리금균등은 계약대로 갚는 동안 월 납부액이 표준 계산기 값과 같다", () => {
    const loan = liability({ kind: "amortized", original_principal: 300_000_000, annual_rate: 4.2, term_months: 360, start_month: "2026-01" });
    const first = scheduledPayment(loan, "2026-01", 300_000_000);
    // 이자 3억 × 4.2% ÷ 12 = 105만
    expect(first).toEqual({ principal: 417_052, interest: 1_050_000, payment: 1_467_052 });
    // 둘째 달: 잔액 299,582,948 → 이자 1,048,540.32 → 1,048,540. 남은 359회차로 다시 나눠도 납부액은 같다.
    const second = scheduledPayment(loan, "2026-02", 300_000_000 - 417_052);
    expect(second.interest).toBe(1_048_540);
    expect(Math.abs(second.payment - 1_467_052)).toBeLessThanOrEqual(1);
  });

  it("원금 유지 차용금: 월 지급액 0원은 0원이고(이율로 대체하지 않는다), 없을 때만 이율로 계산한다", () => {
    const loan = liability({ kind: "interest_only", original_principal: 40_000_000, annual_rate: 3, monthly_payment: 0 });
    expect(scheduledPayment(loan, "2026-03", 40_000_000)).toEqual({ principal: 0, interest: 0, payment: 0 });
    // 4,000만 × 3% ÷ 12 = 10만
    expect(scheduledPayment({ ...loan, monthly_payment: null }, "2026-03", 40_000_000)).toEqual({
      principal: 0,
      interest: 100_000,
      payment: 100_000,
    });
    // 이율로 계산할 때는 최초 원금이 아니라 남은 원금 기준이다: 2,500만 × 3% ÷ 12 = 62,500
    expect(scheduledPayment({ ...loan, monthly_payment: null }, "2026-03", 25_000_000).interest).toBe(62_500);
  });

  it("원금균등 전체 일정: 원금 합은 최초 원금이고 마지막 회차가 끝수를 정리한다", () => {
    const loan = liability({ kind: "equal_principal", original_principal: 10_000_000, annual_rate: 6, term_months: 36, start_month: "2026-01" });
    const rows = buildSchedule(loan, "2026-01", 10_000_000);
    expect(rows).toHaveLength(36);
    expect(rows.reduce((total, row) => total + row.principal, 0)).toBe(10_000_000);
    expect(rows[0]).toEqual({ month: "2026-01", principal: 277_778, interest: 50_000, payment: 327_778, balance: 9_722_222 });
    // 둘째 달 이자: 9,722,222 × 0.5% = 48,611.11
    expect(rows[1]).toMatchObject({ principal: 277_778, interest: 48_611, balance: 9_444_444 });
    // 마지막 회차: 1,000만 − 35 × 277,778 = 277,770, 이자 277,770 × 0.5% = 1,388.85 → 1,389
    expect(rows[35]).toEqual({ month: "2028-12", principal: 277_770, interest: 1_389, payment: 279_159, balance: 0 });
    expect(payoffMonth(loan, "2026-01", 10_000_000)).toBe("2028-12");
  });

  it("원금균등·무이자 할부: 월 원금이 내림으로 계산돼도 계약 기간 안에 끝난다", () => {
    // 1,000만 ÷ 30 = 333,333 → 29회 뒤 333,343원이 남는다. 마지막 회차에 전부 갚아야 31번째 달이 생기지 않는다.
    const equal = liability({ kind: "equal_principal", original_principal: 10_000_000, annual_rate: 0, term_months: 30, start_month: "2026-01" });
    const installment = liability({ kind: "installment", original_principal: 10_000_000, term_months: 30, start_month: "2026-01" });
    for (const loan of [equal, installment]) {
      const rows = buildSchedule(loan, "2026-01", 10_000_000);
      expect(rows).toHaveLength(30);
      expect(rows[28]).toMatchObject({ principal: 333_333, balance: 333_343 });
      expect(rows[29]).toMatchObject({ month: "2028-06", principal: 333_343, balance: 0 });
      expect(rows.reduce((total, row) => total + row.principal, 0)).toBe(10_000_000);
      expect(payoffMonth(loan, "2026-01", 10_000_000)).toBe(liabilityEndMonth(loan));
    }
  });

  it("만기일시상환 전체 일정: 만기 전에는 원금이 그대로이고 만기에 한 번에 갚는다", () => {
    const loan = liability({ kind: "bullet", original_principal: 50_000_000, annual_rate: 3.6, term_months: 24, start_month: "2026-01" });
    const rows = buildSchedule(loan, "2026-01", 50_000_000);
    expect(rows).toHaveLength(24);
    expect(rows.slice(0, 23).every((row) => row.principal === 0 && row.interest === 150_000 && row.balance === 50_000_000)).toBe(true);
    expect(rows[23]).toEqual({ month: "2027-12", principal: 50_000_000, interest: 150_000, payment: 50_150_000, balance: 0 });
    // 이자 합계 = 15만 × 24
    expect(rows.reduce((total, row) => total + row.interest, 0)).toBe(3_600_000);
  });

  it("첫 납부 월 전부터 일정을 만들면 그 전 달은 납부액 0으로 잔액이 유지된다", () => {
    const loan = liability({ kind: "installment", original_principal: 1_500_000, monthly_payment: 500_000, start_month: "2026-03" });
    const rows = buildSchedule(loan, "2026-01", 1_500_000);
    expect(rows.map((row) => [row.month, row.payment, row.balance])).toEqual([
      ["2026-01", 0, 1_500_000],
      ["2026-02", 0, 1_500_000],
      ["2026-03", 500_000, 1_000_000],
      ["2026-04", 500_000, 500_000],
      ["2026-05", 500_000, 0],
    ]);
  });

  it("잔액이 0이면 일정도 끝나는 달도 없다", () => {
    const loan = liability({ kind: "installment", original_principal: 1_500_000, monthly_payment: 500_000 });
    expect(buildSchedule(loan, "2026-01", 0)).toEqual([]);
    expect(payoffMonth(loan, "2026-01", 0)).toBeNull();
  });

  it("계약상 마지막 납부 월은 첫 납부 월 + 기간 − 1 이고, 둘 중 하나라도 없으면 알 수 없다", () => {
    const loan = liability({ kind: "amortized", original_principal: 1, annual_rate: 1, term_months: 12, start_month: "2026-02" });
    expect(liabilityEndMonth(loan)).toBe("2027-01");
    expect(liabilityEndMonth({ ...loan, term_months: 1 })).toBe("2026-02");
    expect(liabilityEndMonth({ ...loan, term_months: null })).toBeNull();
    expect(liabilityEndMonth({ ...loan, start_month: null })).toBeNull();
  });
});
