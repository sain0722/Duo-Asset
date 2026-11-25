import { ChevronRight } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

type SettingRowProps = {
  label: React.ReactNode;
  /** 라벨 아래 보조 줄 */
  detail?: React.ReactNode;
  /** 오른쪽 값·배지 */
  aside?: React.ReactNode;
  /** 있으면 줄 전체가 버튼이 된다 */
  onClick?: () => void;
};

/** 설정 목록의 한 줄. 누르면 수정 시트가 열린다. */
export function SettingRow({ label, detail, aside, onClick }: SettingRowProps) {
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body font-medium">{label}</span>
        {detail && (
          <span className="truncate text-caption text-muted-foreground">
            {detail}
          </span>
        )}
      </span>
      {aside && (
        <span className="flex shrink-0 items-center gap-2 text-body text-muted-foreground">
          {aside}
        </span>
      )}
      {onClick && (
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
    </>
  );

  const className = "flex min-h-14 w-full items-center gap-3 py-2.5 text-left";
  if (!onClick) return <div className={className}>{body}</div>;
  // 테두리(divide-y)는 바깥 div 에 그린다. 버튼은 좌우로 넓혀 둥근 hover 바탕만 가진다.
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          className,
          "-mx-2 w-[calc(100%+1rem)] rounded-xl px-2 outline-none transition-colors hover:bg-accent",
          "focus-visible:ring-[3px] focus-visible:ring-ring/40",
        )}
      >
        {body}
      </button>
    </div>
  );
}
