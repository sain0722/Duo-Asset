"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useMutate } from "@/lib/data/hooks";
import { updateRow, type Patch } from "@/lib/data/mutations";
import { resolveAssumptions } from "@/lib/finance";
import type { Assumptions, Scenario } from "@/lib/finance/types";

import { storedAssumptions } from "./projection";

/**
 * 시나리오 행 수정기. 가정 자동 저장과 이벤트 켜기·끄기가 같은 행을 고치므로
 * 순서대로 보내고, 직전 저장으로 올라간 version 을 다음 저장에 쓴다 (재조회를 기다리지 않아도 충돌하지 않게).
 */
export function useScenarioWriter() {
  const mutate = useMutate();
  const latest = useRef(new Map<string, Scenario>());
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  return useCallback(
    (scenario: Scenario, patch: Patch<Scenario>, options?: { success?: string }) => {
      const run = queue.current.then(async () => {
        const known = latest.current.get(scenario.id);
        const row = known && known.version > scenario.version ? known : scenario;
        const result = await mutate(() => updateRow<Scenario>("scenarios", row, patch), options);
        if (result.ok) latest.current.set(scenario.id, result.value);
        return result;
      });
      queue.current = run;
      return run;
    },
    [mutate],
  );
}

const SAVE_DELAY_MS = 700;

type DraftState = { id: string; storedKey: string; values: Assumptions; dirty: boolean };

/**
 * 조정 중인 가정. 바꾸는 즉시 values 로 다시 계산하고, 손을 멈추면 바뀐 값만 저장한다.
 * 저장하지 않은 수정이 없을 때만 다른 기기에서 바뀐 값을 받아들인다.
 */
export function useAssumptionDraft(scenario: Scenario, write: ReturnType<typeof useScenarioWriter>) {
  const storedKey = JSON.stringify(storedAssumptions(resolveAssumptions(scenario.assumptions)));
  const fresh = (): DraftState => ({
    id: scenario.id,
    storedKey,
    values: resolveAssumptions(scenario.assumptions),
    dirty: false,
  });
  const [state, setState] = useState<DraftState>(fresh);

  let current = state;
  if (state.id !== scenario.id || (state.storedKey !== storedKey && !state.dirty)) {
    current = fresh();
    setState(current);
  } else if (state.storedKey !== storedKey && JSON.stringify(storedAssumptions(state.values)) === storedKey) {
    // 내 저장이 반영되어 돌아왔다
    current = { ...state, storedKey, dirty: false };
    setState(current);
  }

  const { values, dirty } = current;
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(async () => {
      const saved = storedAssumptions(values);
      const result = await write(scenario, { assumptions: saved });
      setState((s) => {
        // 실패하면(충돌 등) 다시 읽은 값으로 돌아간다
        if (!result.ok) return { ...s, dirty: false };
        // 저장하는 사이 더 바꿨다면 그 값은 다음 저장에서 보낸다
        return s.values === values ? { ...s, storedKey: JSON.stringify(saved), dirty: false } : s;
      });
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [dirty, values, scenario, write]);

  const update = useCallback((patch: Partial<Assumptions>) => {
    setState((s) => ({ ...s, values: { ...s.values, ...patch }, dirty: true }));
  }, []);

  return { values, dirty, update };
}
