import { describe, expect, it } from "vitest";
import { computeMonthReport } from "./settlement";
import { suggestInputs } from "./suggest";
import { actual, asset, assetSnap, liability, liabilitySnap, member, monthInput, planItem } from "./testing";

describe("한 번에 확인할 수 있는 값 제안", () => {
  const haneul = member("하늘");
  const bada = member("바다");
  const account = asset({ kind: "cash", owner_member_id: haneul.id, name: "통장" });
  const savings = asset({ kind: "savings", owner_member_id: bada.id, name: "적금" });
  const lease = asset({ kind: "lease_deposit", name: "보증금", liquidity: "locked" });
  const stock = asset({ kind: "investment", owner_member_id: haneul.id, name: "증권" });
  const carLoan = liability({ kind: "installment", name: "할부", original_principal: 12_000_000, monthly_payment: 500_000, payer_member_id: haneul.id });
  const parents = liability({ kind: "interest_only", name: "차용금", original_principal: 30_000_000, monthly_payment: 300_000, payer_member_id: haneul.id });
  const salary = planItem({ kind: "income", amount: 4_000_000, member_id: haneul.id, name: "급여" });
  const contribution = planItem({ kind: "contribution", amount: 2_000_000, member_id: haneul.id, name: "공용통장 입금" });
  const saving = planItem({ kind: "saving", amount: 500_000, member_id: bada.id, asset_id: savings.id, name: "적금" });

  const base = {
    members: [haneul, bada],
    assets: [account, savings, lease, stock],
    liabilities: [carLoan, parents],
    planItems: [salary, contribution, saving],
    prevAssets: [assetSnap(account, 1_000_000), assetSnap(savings, 3_000_000), assetSnap(lease, 50_000_000), assetSnap(stock, 9_000_000, 8_000_000)],
    prevLiabilities: [liabilitySnap(carLoan, 6_000_000), liabilitySnap(parents, 30_000_000)],
  };

  it("구조상 값이 정해지는 항목만 제안한다: 예적금·보증금, 부채, 계획된 수입·납입", () => {
    const suggested = suggestInputs(computeMonthReport(monthInput(base)));
    // 적금은 전월 + 저축 계획, 보증금은 변동 없음. 통장과 주식은 직접 확인해야 하므로 제안하지 않는다.
    expect(suggested.assets).toEqual([
      { assetId: savings.id, name: "적금", value: 3_500_000, principal: 3_500_000, reason: "planned_saving" },
      { assetId: lease.id, name: "보증금", value: 50_000_000, principal: 50_000_000, reason: "unchanged" },
    ]);
    expect(suggested.liabilities).toEqual([
      { liabilityId: carLoan.id, name: "할부", balance: 5_500_000, interestPaid: null },
      { liabilityId: parents.id, name: "차용금", balance: 30_000_000, interestPaid: 300_000 },
    ]);
    expect(suggested.entries.map((e) => [e.kind, e.name, e.amount, e.memberId])).toEqual([
      ["income", "급여", 4_000_000, haneul.id],
      ["contribution", "공용통장 입금", 2_000_000, haneul.id],
    ]);
    expect(suggested.count).toBe(6);
  });

  it("이미 확인한 항목은 제안하지 않는다", () => {
    const report = computeMonthReport(
      monthInput({
        ...base,
        curAssets: [assetSnap(savings, 3_400_000)],
        curLiabilities: [liabilitySnap(carLoan, 5_000_000)],
        entries: [actual(salary, 4_100_000)],
      }),
    );
    const suggested = suggestInputs(report);
    expect(suggested.assets.map((a) => a.name)).toEqual(["보증금"]);
    expect(suggested.liabilities.map((l) => l.name)).toEqual(["차용금"]);
    expect(suggested.entries.map((e) => e.name)).toEqual(["공용통장 입금"]);
  });

  it("제안을 모두 저장하고 통장·주식만 확인하면 정산이 끝난다", () => {
    const suggested = suggestInputs(computeMonthReport(monthInput(base)));
    const report = computeMonthReport(
      monthInput({
        ...base,
        curAssets: [
          ...suggested.assets.map((a) => assetSnap(a.assetId === savings.id ? savings : lease, a.value, a.principal)),
          // 통장: +400 −200(공용) −50(할부) −30(차용금 지급) −100(생활비) = +20
          assetSnap(account, 1_200_000),
          assetSnap(stock, 9_300_000, 8_000_000),
        ],
        curLiabilities: suggested.liabilities.map((l) =>
          liabilitySnap(l.liabilityId === carLoan.id ? carLoan : parents, l.balance, { interest_paid: l.interestPaid }),
        ),
        entries: [actual(salary, 4_000_000), actual(contribution, 2_000_000)],
      }),
    );
    expect(report.complete).toBe(true);
    expect(report.principalRepaid).toBe(500_000);
    expect(report.investmentGain).toBe(300_000);
  });

  it("기준 월에는 제안하지 않는다 (비교할 전월 값이 없다)", () => {
    const report = computeMonthReport(monthInput({ ...base, isBaseline: true, prevAssets: [], prevLiabilities: [] }));
    expect(suggestInputs(report).count).toBe(0);
  });
});
