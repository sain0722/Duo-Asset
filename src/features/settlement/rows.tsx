"use client";

import { Check, LoaderCircle } from "lucide-react";
import { Children, useState } from "react";

import { Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import type { Won } from "@/lib/finance/types";
import { cn } from "@/lib/utils";

import { useSaver } from "./save-status";

/** 확인 대상 한 줄. 미확인이면 "다음 미확인으로"가 찾을 수 있게 표시한다. */
export function Row({ id, unconfirmed, children }: { id: string; unconfirmed?: boolean; children: React.ReactNode }) {
  return (
    <li id={id} data-unconfirmed={unconfirmed || undefined} className="scroll-mt-28 py-4 first:pt-1 last:pb-1 lg:scroll-mt-10">
      {children}
    </li>
  );
}

export function RowHead({
  title,
  sub,
  aside,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2 text-body font-medium">{title}</div>
        {sub && <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground">{sub}</div>}
      </div>
      {aside && <div className="flex shrink-0 items-center">{aside}</div>}
    </div>
  );
}

/** 확인된 값. 누르면 수정한다. */
export function ConfirmedValue({
  amount,
  label,
  onClick,
  pending,
  children,
}: {
  amount: Won | null;
  label: string;
  onClick?: () => void;
  pending?: boolean;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      {pending ? (
        <LoaderCircle aria-hidden className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <Check aria-hidden className="size-4 text-brand" strokeWidth={2.5} />
      )}
      <span className="flex flex-col items-end">
        <Money amount={amount} className="text-body font-semibold" />
        {children}
      </span>
    </>
  );
  if (!onClick) return <span className="flex items-center gap-1.5">{body}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} 수정`}
      className={cn(
        "-mr-2 flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-right transition-colors outline-none",
        "hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
      )}
    >
      {body}
    </button>
  );
}

export function PendingMark({ pending, optional }: { pending: boolean; optional?: boolean }) {
  if (optional && !pending) return <span className="text-caption text-muted-foreground">입력 전</span>;
  if (pending) {
    return (
      <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
        <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
        저장 중
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-caption font-medium text-warning-foreground">
      <span aria-hidden className="size-1.5 rounded-full bg-warning" />
      미확인
    </span>
  );
}

/**
 * 빠른 확인 버튼. 누를 때 입력 칸의 포커스를 빼앗지 않아(blur 저장이 먼저 일어나지 않게) 버튼의 값만 저장된다.
 */
export function QuickButton({ primary, ...props }: React.ComponentProps<typeof Button> & { primary?: boolean }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size={primary ? "lg" : "sm"}
      className={primary ? "shrink-0 px-4 text-body" : undefined}
      onMouseDown={(event) => event.preventDefault()}
      {...props}
    />
  );
}

/**
 * 입력 묶음. 포커스가 묶음 밖으로 나갈 때(또는 Enter) commit 한다.
 * 한 행에 입력이 둘 이상(평가금액 + 순입금)이어도 칸을 옮길 때마다 저장하지 않는다.
 */
export function EditGroup({
  onCommit,
  className,
  children,
}: {
  onCommit: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={className}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onCommit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          event.target.blur();
        }
      }}
    >
      {children}
    </div>
  );
}

export function RowActions({ children }: { children: React.ReactNode }) {
  if (Children.toArray(children).length === 0) return null;
  return <div className="-mt-1 flex flex-wrap items-center gap-2">{children}</div>;
}

/** 입력 칸 + 오른쪽의 대표 빠른 확인 버튼(계획대로 · 변동 없음). 좁은 화면에서도 한 줄에 둔다. */
export function InputWithQuick({ input, quick }: { input: React.ReactNode; quick?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1">{input}</div>
      {quick}
    </div>
  );
}

/**
 * 계획 금액과 실제 금액을 짝짓는 줄 (수입 · 공용통장 입금 · 고정지출).
 * 미확인이면 입력 칸과 [계획대로], 확인됐으면 ✓ 금액 — 누르면 수정하거나 확인을 취소한다.
 */
export function AmountRow({
  rowId,
  pendingKey,
  title,
  sub,
  planned,
  actual,
  quickLabel = "계획대로",
  onSave,
  onClear,
  optional,
}: {
  rowId: string;
  pendingKey: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  planned: Won | null;
  actual: Won | null;
  quickLabel?: string;
  onSave: (amount: Won) => Promise<boolean>;
  onClear?: () => Promise<boolean>;
  /** 마감에 필요하지 않은 줄 (지출 확인) */
  optional?: boolean;
}) {
  const { isPending } = useSaver();
  const pending = isPending(pendingKey);
  const confirmed = actual !== null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Won | null>(actual);
  const label = typeof title === "string" ? title : "금액";

  async function commit(amount: Won | null) {
    if (amount === null || amount === actual) {
      if (confirmed) setEditing(false);
      return;
    }
    const ok = await onSave(amount);
    if (ok) setEditing(false);
  }

  return (
    <Row id={rowId} unconfirmed={!confirmed && !optional}>
      <RowHead
        title={title}
        sub={
          <>
            {sub}
            {planned !== null && (
              <span>
                계획 <Money amount={planned} />
              </span>
            )}
          </>
        }
        aside={
          confirmed && !editing ? (
            <ConfirmedValue amount={actual} label={label} pending={pending} onClick={() => setEditing(true)} />
          ) : (
            !confirmed && <PendingMark pending={pending} optional={optional} />
          )
        }
      />
      {(!confirmed || editing) && (
        <EditGroup onCommit={() => void commit(draft)} className="mt-2 flex flex-col gap-1">
          <InputWithQuick
            input={
              <MoneyInput
                value={draft}
                onChange={setDraft}
                placeholder="실제 금액"
                aria-label={`${label} 실제 금액`}
                disabled={pending}
                autoFocus={editing}
              />
            }
            quick={
              planned !== null && (
                <QuickButton primary disabled={pending} onClick={() => void commit(planned)}>
                  {quickLabel}
                </QuickButton>
              )
            }
          />
          <RowActions>
            {editing && onClear && (
              <QuickButton variant="ghost" disabled={pending} onClick={() => void onClear().then((ok) => ok && setEditing(false))}>
                확인 취소
              </QuickButton>
            )}
            {editing && (
              <QuickButton variant="ghost" className="ml-auto" onClick={() => setEditing(false)}>
                닫기
              </QuickButton>
            )}
          </RowActions>
        </EditGroup>
      )}
    </Row>
  );
}
