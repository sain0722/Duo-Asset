"use client";

import { Check, LoaderCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import { useMutate } from "@/lib/data/hooks";
import { cn } from "@/lib/utils";

type Status = "idle" | "saving" | "saved" | "failed";

interface Saver {
  /** 행 key(들)을 "저장 중"으로 표시하고 action 을 한 번의 mutate 로 실행한다. 성공 여부를 돌려준다. */
  save: (keys: string | string[], action: () => Promise<unknown>, options?: { success?: string }) => Promise<boolean>;
  isPending: (key: string) => boolean;
  status: Status;
}

const SaverContext = createContext<Saver | null>(null);

/**
 * 정산 화면의 저장 상태. 행마다 "저장 중"을 보여 주고, 화면 위에는 전체 상태(저장 중 / 저장됨)를 보여 준다.
 * 같은 행을 저장하는 중에 다시 저장하면 읽었던 version 이 낡아 충돌하므로 무시한다.
 */
export function SaverProvider({ children }: { children: React.ReactNode }) {
  const mutate = useMutate();
  // 이벤트 사이에 바로 확인해야 하므로 ref 에 두고, 화면에는 복사본을 그린다
  const pendingRef = useRef(new Set<string>());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [last, setLast] = useState<Exclude<Status, "saving">>("idle");

  const save = useCallback<Saver["save"]>(
    async (keys, action, options) => {
      const list = Array.isArray(keys) ? keys : [keys];
      if (list.some((key) => pendingRef.current.has(key))) return false;
      for (const key of list) pendingRef.current.add(key);
      setPending(new Set(pendingRef.current));
      const result = await mutate(action, options);
      for (const key of list) pendingRef.current.delete(key);
      setPending(new Set(pendingRef.current));
      setLast(result.ok ? "saved" : "failed");
      return result.ok;
    },
    [mutate],
  );

  const value = useMemo<Saver>(
    () => ({ save, isPending: (key) => pending.has(key), status: pending.size > 0 ? "saving" : last }),
    [save, pending, last],
  );
  return <SaverContext.Provider value={value}>{children}</SaverContext.Provider>;
}

export function useSaver(): Saver {
  const saver = useContext(SaverContext);
  if (!saver) throw new Error("useSaver 는 SaverProvider 안에서만 쓸 수 있습니다.");
  return saver;
}

/** 화면 위의 저장 상태 표시 */
export function SaveIndicator({ className }: { className?: string }) {
  const { status } = useSaver();
  if (status === "idle" || status === "failed") return null;
  return (
    <span role="status" className={cn("inline-flex items-center gap-1 text-caption text-muted-foreground", className)}>
      {status === "saving" ? (
        <>
          <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
          저장 중
        </>
      ) : (
        <>
          <Check aria-hidden className="size-3.5" />
          저장됨
        </>
      )}
    </span>
  );
}
