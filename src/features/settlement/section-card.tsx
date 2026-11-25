"use client";

import { Check, ChevronDown } from "lucide-react";
import { useId } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { Progress } from "./model";

/**
 * 정산 흐름의 한 영역. 제목 줄을 누르면 접고 펼친다(긴 화면을 모바일에서 다루기 위해).
 * 제목 옆에는 확인 진행 상태를, 오른쪽에는 영역 전체를 확인하는 버튼(action)을 둔다.
 */
export function SectionCard({
  id,
  step,
  title,
  description,
  progress,
  optional,
  action,
  open,
  onOpenChange,
  children,
}: {
  id: string;
  step: number;
  title: string;
  description?: React.ReactNode;
  progress?: Progress;
  optional?: boolean;
  action?: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const contentId = useId();
  const done = progress && progress.done === progress.total;

  return (
    <Card id={id} className="scroll-mt-24 gap-0 py-0 sm:gap-0 sm:py-0 lg:scroll-mt-8">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => onOpenChange(!open)}
          className={cn(
            "flex min-h-16 w-full items-center gap-3 rounded-2xl px-5 py-3 text-left outline-none sm:px-6",
            "focus-visible:ring-[3px] focus-visible:ring-ring/40",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "grid size-6 shrink-0 place-content-center rounded-full text-xs font-semibold tabular-nums",
              done ? "bg-brand text-brand-foreground" : "bg-secondary text-secondary-foreground",
            )}
          >
            {done ? <Check className="size-3.5" strokeWidth={3} /> : step}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-base font-semibold">{title}</span>
              {progress && progress.total > 0 && (
                <span className={cn("text-sm tabular-nums", done ? "text-brand" : "text-muted-foreground")}>
                  확인 {progress.done}/{progress.total}
                </span>
              )}
              {optional && <span className="text-sm text-muted-foreground">선택</span>}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn("ml-auto size-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </button>
      {open && (
        <CardContent id={contentId} className="pb-5 sm:pb-6">
          {(description || action) && (
            <div className="-mt-1 mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              {description && <p className="min-w-0 flex-1 basis-48 text-sm text-muted-foreground">{description}</p>}
              {action && <div className="ml-auto shrink-0">{action}</div>}
            </div>
          )}
          {children}
        </CardContent>
      )}
    </Card>
  );
}
