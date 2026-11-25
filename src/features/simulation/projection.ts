import { DEFAULT_ASSUMPTIONS } from "@/lib/finance";
import type { Assumptions, SimulationPoint, Won, Ym } from "@/lib/finance/types";

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

// 월 투자액을 비워 둘 때 시뮬레이션이 쓰는 값 (입력란에 "계획대로 ○○원"을 보여 주는 데 쓴다)
export { plannedMonthlyInvestment } from "@/lib/finance";
