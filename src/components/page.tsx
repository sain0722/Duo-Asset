import * as React from "react";

import { cn } from "@/lib/utils";

type PageContainerProps = React.ComponentProps<"div"> & {
  /** default: 대시보드·목록(최대 72rem) · narrow: 설정·단일 폼(최대 40rem) */
  size?: "default" | "narrow";
};

/** 화면 본문 틀. 반응형 좌우 여백과 최대 폭을 맞춘다. 화면마다 하나만 쓴다. */
function PageContainer({ size = "default", className, ...props }: PageContainerProps) {
  return (
    <div
      data-slot="page-container"
      className={cn(
        "mx-auto flex w-full flex-col gap-5 px-4 pt-5 pb-10 sm:gap-6 sm:px-6 lg:px-8 lg:pt-8",
        size === "narrow" ? "max-w-2xl" : "max-w-6xl",
        className,
      )}
      {...props}
    />
  );
}

type PageHeaderProps = Omit<React.ComponentProps<"header">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** 제목 오른쪽 영역(월 전환, 주요 버튼 등) */
  actions?: React.ReactNode;
};

function PageHeader({ title, description, actions, className, ...props }: PageHeaderProps) {
  return (
    <header data-slot="page-header" className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-3", className)} {...props}>
      <div className="min-w-0">
        <h1 className="text-[1.375rem] leading-tight font-bold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export { PageContainer, PageHeader };
export type { PageContainerProps, PageHeaderProps };
