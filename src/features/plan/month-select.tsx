import type { ComponentProps } from "react";

import { NativeSelect } from "@/components/ui/native-select";
import type { Ym } from "@/lib/finance/types";
import { formatYm } from "@/lib/format";
import { compareYm, ymRange } from "@/lib/month";

type MonthSelectProps = Omit<ComponentProps<"select">, "value" | "onChange"> & {
  value: Ym | null;
  onChange: (value: Ym | null) => void;
  from: Ym;
  to: Ym;
  /** 비워 둘 수 있으면 첫 선택지의 이름 ("처음부터", "계속") */
  emptyLabel?: string;
};

/** 월 선택. <input type="month"> 는 데스크톱 Safari 등에서 지원되지 않아 목록으로 고른다. */
export function MonthSelect({ value, onChange, from, to, emptyLabel, ...props }: MonthSelectProps) {
  const months = ymRange(from, to);
  if (value && (compareYm(value, from) < 0 || compareYm(value, to) > 0)) months.push(value);
  months.sort(compareYm);
  return (
    <NativeSelect value={value ?? ""} onChange={(event) => onChange(event.target.value || null)} {...props}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {months.map((month) => (
        <option key={month} value={month}>
          {formatYm(month)}
        </option>
      ))}
    </NativeSelect>
  );
}
