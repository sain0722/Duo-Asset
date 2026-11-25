import { ASSET_KINDS, DEFAULT_ASSUMPTIONS, isPlanItemActive } from "@/lib/finance";
import type { Asset, Assumptions, PlanItem, SimulationPoint, Won, Ym } from "@/lib/finance/types";

export interface HorizonRow {
  years: number;
  month: Ym;
  netWorth: Won;
  /** 기본 시나리오 대비 차이. 비교 대상이 없으면 null */
  diff: Won | null;
}

/** n년 뒤(시작 월부터 12n번째 달 말) 순자산. 기간을 넘는 해는 뺀다. */
export function horizonRows(points: SimulationPoint[], basePoints: SimulationPoint[] | null, years: number[]): HorizonRow[] {
  return years.flatMap((n) => {
    const point = points[n * 12 - 1];
    if (!point) return [];
    const base = basePoints?.[n * 12 - 1];
    return [{ years: n, month: point.month, netWorth: point.netWorth, diff: base ? point.netWorth - base.netWorth : null }];
  });
}

/** scenarios.assumptions 에는 기본값과 다른 값만 저장한다 */
export function storedAssumptions(values: Assumptions): Partial<Assumptions> {
  const changed: Partial<Assumptions> = {};
  for (const key of Object.keys(DEFAULT_ASSUMPTIONS) as (keyof Assumptions)[]) {
    if (values[key] !== DEFAULT_ASSUMPTIONS[key]) Object.assign(changed, { [key]: values[key] });
  }
  return changed;
}

/**
 * 월 투자액을 비워 둘 때 시뮬레이션이 쓰는 값: 그 달에 유효한 저축 계획 항목 중 투자·연금 자산으로 가는 것의 합.
 * (lib/finance/simulation 의 기본값과 같은 규칙 — 입력란에 "계획대로 ○○원"을 보여 주는 데 쓴다)
 */
export function plannedMonthlyInvestment(planItems: PlanItem[], assets: Asset[], month: Ym): Won {
  const kindById = new Map(assets.map((asset) => [asset.id, asset.kind]));
  return planItems
    .filter(
      (item) =>
        item.kind === "saving" &&
        item.asset_id !== null &&
        isPlanItemActive(item, month) &&
        ASSET_KINDS[kindById.get(item.asset_id) ?? "cash"].bucket === "invested",
    )
    .reduce((total, item) => total + item.amount, 0);
}
