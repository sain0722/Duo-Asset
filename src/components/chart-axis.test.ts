import { describe, expect, it } from "vitest";

import { moneyAxis } from "./chart-axis";

describe("moneyAxis", () => {
  it("값의 차이가 충분하면 자동 눈금을 쓴다", () => {
    expect(moneyAxis([120_000_000, 180_000_000], false)).toEqual({ domain: ["auto", "auto"] });
    expect(moneyAxis([0, 2_000_000], true)).toEqual({ domain: [0, "auto"] });
    expect(moneyAxis([], false)).toEqual({ domain: ["auto", "auto"] });
  });

  it("값이 하나뿐이거나 모두 같으면 범위를 넓혀 서로 다른 눈금 4개를 만든다", () => {
    const axis = moneyAxis([12_390_000_000], false);
    expect(axis.ticks).toEqual([11_500_000_000, 12_000_000_000, 12_500_000_000, 13_000_000_000]);
    expect(axis.domain).toEqual([11_500_000_000, 13_000_000_000]);

    expect(moneyAxis([48_000_000, 48_000_000], false).ticks).toEqual([46_000_000, 48_000_000, 50_000_000, 52_000_000]);
  });

  it("표기 단위(0.1억)보다 변화가 작으면 그 단위로 눈금을 나눈다", () => {
    const axis = moneyAxis([1_231_000_000, 1_236_000_000], false);
    expect(axis.ticks).toEqual([1_220_000_000, 1_230_000_000, 1_240_000_000, 1_250_000_000]);
  });

  it("넓힌 범위는 항상 모든 값을 포함한다", () => {
    for (const values of [[5_000], [0], [-30_000_000], [99_999_999, 100_000_001], [1_000_000_000, 1_029_999_999]]) {
      const axis = moneyAxis(values, false);
      const [low, high] = axis.domain as [number, number];
      expect(low).toBeLessThanOrEqual(Math.min(...values));
      expect(high).toBeGreaterThanOrEqual(Math.max(...values));
      expect(new Set(axis.ticks).size).toBe(4);
    }
  });

  it("양수 값의 축은 0 아래로 내려가지 않는다", () => {
    expect(moneyAxis([0, 0], true)).toEqual({ domain: [0, 30_000], ticks: [0, 10_000, 20_000, 30_000] });
    expect((moneyAxis([8_000], false).domain as number[])[0]).toBeGreaterThanOrEqual(0);
  });
});
