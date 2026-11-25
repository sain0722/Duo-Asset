"use client";

import { createContext, useContext } from "react";

import type { HouseholdData, MonthData } from "@/lib/data/types";
import type { MonthReport, MonthRow } from "@/lib/finance/types";

import type { CheckItem, SectionId } from "./model";

/** 열린 달의 정산 영역들이 함께 쓰는 값. 저장 후 재조회되면 통째로 새 값이 내려온다. */
export interface OpenMonthContext {
  data: HouseholdData;
  month: MonthRow;
  report: MonthReport;
  /** 이 달의 입력 행 (수정할 때 읽었던 version 을 넘기기 위해) */
  own: MonthData;
  items: CheckItem[];
  /** 해당 행으로 이동한다 (접힌 영역은 펼친다) */
  jumpTo: (section: SectionId, rowId?: string) => void;
}

const Context = createContext<OpenMonthContext | null>(null);
export const OpenMonthProvider = Context.Provider;

export function useOpenMonth(): OpenMonthContext {
  const value = useContext(Context);
  if (!value) throw new Error("useOpenMonth 는 OpenMonthProvider 안에서만 쓸 수 있습니다.");
  return value;
}
