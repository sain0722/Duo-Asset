"use client";

import { Info } from "lucide-react";
import * as React from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type InfoTipProps = {
  /** 설명하는 지표 이름. 팝오버 제목과 버튼의 접근성 이름에 쓴다. */
  title?: string;
  /** 지표의 정의. 문구는 docs/finance-rules.md 와 일치시킨다. */
  children: React.ReactNode;
  className?: string;
};

/** 지표 정의를 보여 주는 (i) 버튼. 누르면 열리므로 모바일에서도 읽을 수 있다. */
function InfoTip({ title, children, className }: InfoTipProps) {
  return (
    <Popover>
      <PopoverTrigger
        data-slot="info-tip"
        aria-label={title ? `${title} 설명` : "설명"}
        className={cn(
          "relative inline-grid size-5 shrink-0 place-content-center rounded-full align-middle text-muted-foreground/80",
          "transition-colors outline-none after:absolute after:-inset-3 hover:text-foreground",
          "focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:text-foreground",
          className,
        )}
      >
        <Info className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="flex flex-col gap-1.5 text-sm leading-relaxed font-normal">
        {title && <p className="font-semibold text-foreground">{title}</p>}
        <div className="text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

export { InfoTip };
export type { InfoTipProps };
