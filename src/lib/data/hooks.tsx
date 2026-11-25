"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext } from "react";
import { toast } from "sonner";
import { describeError } from "./errors";
import { fetchHousehold } from "./queries";
import type { HouseholdData } from "./types";

export const HOUSEHOLD_KEY = ["household"] as const;

/** 가구 데이터 쿼리. 메모리에만 캐시하고, 창에 포커스가 돌아오면 다시 읽는다. */
export function useHouseholdQuery() {
  return useQuery({ queryKey: HOUSEHOLD_KEY, queryFn: fetchHousehold });
}

const HouseholdContext = createContext<HouseholdData | null>(null);
export const HouseholdProvider = HouseholdContext.Provider;

/** 가구 데이터. (app) 레이아웃의 HouseholdGate 가 로딩을 끝낸 뒤에만 렌더링되므로 항상 값이 있다. */
export function useHousehold(): HouseholdData {
  const data = useContext(HouseholdContext);
  if (!data) throw new Error("useHousehold 는 HouseholdGate 안에서만 쓸 수 있습니다.");
  return data;
}

export type MutationResult<T> = { ok: true; value: T } | { ok: false };

/**
 * 변경 실행기. 성공하면 가구 데이터를 다시 읽고, 실패하면 오류를 토스트로 알린다.
 * 충돌(다른 기기에서 먼저 수정)일 때도 최신 값을 다시 읽어 화면을 맞춘다.
 *
 *   const mutate = useMutate();
 *   const result = await mutate(() => updateRow("assets", asset, { name }), { success: "저장했습니다" });
 *   if (result.ok) close();
 */
export function useMutate() {
  const queryClient = useQueryClient();
  return useCallback(
    async function run<T>(action: () => Promise<T>, options?: { success?: string }): Promise<MutationResult<T>> {
      try {
        const value = await action();
        await queryClient.invalidateQueries({ queryKey: HOUSEHOLD_KEY });
        if (options?.success) toast.success(options.success);
        return { ok: true, value };
      } catch (error) {
        toast.error(describeError(error));
        await queryClient.invalidateQueries({ queryKey: HOUSEHOLD_KEY });
        return { ok: false };
      }
    },
    [queryClient],
  );
}
