/**
 * 금액 축의 범위와 눈금. 값이 모두 같거나 변화가 눈금 표기 단위(0.1억·0.1만)보다 작으면
 * 자동 눈금이 같은 글자("123.9억")를 여러 번 찍으므로, 그때만 범위를 넓혀 눈금을 직접 정한다.
 * 그 밖에는 Recharts 의 자동 눈금을 쓴다.
 */
export type MoneyAxis =
  | { domain: [number | "auto", "auto"]; ticks?: undefined }
  | { domain: [number, number]; ticks: number[] };

/** 축 눈금 글자가 구분할 수 있는 최소 차이 (chart.tsx 의 formatAxisWon 과 같은 기준) */
function labelUnit(magnitude: number): number {
  if (magnitude >= 100_000_000) return 10_000_000; // 0.1억
  if (magnitude >= 10_000) return 1_000; // 0.1만
  return 1;
}

/** 1·2·5 × 10ⁿ 중 value 이하에서 가장 큰 수 */
function niceFloor(value: number): number {
  if (value <= 0) return 0;
  const power = 10 ** Math.floor(Math.log10(value));
  const leading = value / power;
  return (leading >= 5 ? 5 : leading >= 2 ? 2 : 1) * power;
}

/**
 * @param values 차트에 그릴 모든 값 (누적이면 행별 합계)
 * @param fromZero 막대·누적처럼 0 에서 시작하는 축인지
 */
export function moneyAxis(values: readonly number[], fromZero: boolean): MoneyAxis {
  const auto: MoneyAxis = { domain: [fromZero ? 0 : "auto", "auto"] };
  if (values.length === 0) return auto;

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const min = fromZero ? Math.min(dataMin, 0) : dataMin;
  const max = fromZero ? Math.max(dataMax, 0) : dataMax;
  const magnitude = Math.max(Math.abs(min), Math.abs(max));
  const unit = labelUnit(magnitude);
  // 자동 눈금의 간격이 표기 단위보다 작아질 수 있는 범위에서만 눈금을 직접 정한다
  if (max - min >= 3 * unit) return auto;

  if (min === max) {
    // 값이 모두 같다: 크기의 5% 안팎 간격으로 위아래에 여유를 둔다
    const step = Math.max(niceFloor(magnitude * 0.05), unit, 10_000);
    let low = Math.floor(min / step) * step - step;
    if (min >= 0) low = Math.max(low, 0);
    return ticksFrom(low, step, 3);
  }

  // 값이 조금 다르다: 표기 단위의 배수로 값의 범위를 딱 감싼다 (변화가 납작해 보이지 않게 여유를 더 두지 않는다)
  const low = Math.floor(min / unit) * unit;
  const count = Math.max(Math.ceil((max - low) / unit), 2);
  return ticksFrom(low, unit, count);
}

function ticksFrom(low: number, step: number, count: number): MoneyAxis {
  const ticks = Array.from({ length: count + 1 }, (_, index) => low + step * index);
  return { domain: [low, low + step * count], ticks };
}
