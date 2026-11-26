"use client";

import { NativeSelect } from "@/components/ui/native-select";
import type { Ym } from "@/lib/finance/types";
import { currentYm, ymParts } from "@/lib/month";

type MonthPickerProps = {
  value: Ym;
  onChange: (value: Ym) => void;
  /** 그룹 이름(라벨 id) */
  "aria-labelledby"?: string;
};

/** 연·월 선택. <input type="month"> 는 데스크톱 Safari·Firefox 에서 지원되지 않아 두 개의 선택으로 만든다. */
export function MonthPicker({ value, onChange, ...aria }: MonthPickerProps) {
  const { year, month } = ymParts(value);
  const thisYear = ymParts(currentYm()).year;
  // 미래를 고르는 선택이라 올해부터 보여 준다. 이미 저장된 값이 범위 밖이면 그 연도만 더한다.
  const years = Array.from({ length: 41 }, (_, i) => thisYear + i);
  if (year < thisYear) years.unshift(year);
  else if (!years.includes(year)) years.push(year);
  const set = (y: number, m: number) => onChange(`${y}-${String(m).padStart(2, "0")}`);

  return (
    <div role="group" className="grid grid-cols-[3fr_2fr] gap-2" {...aria}>
      <NativeSelect aria-label="연도" value={year} onChange={(e) => set(Number(e.target.value), month)}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}년
          </option>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="월" value={month} onChange={(e) => set(year, Number(e.target.value))}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>
            {m}월
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
