import * as React from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** 다음 행동(보통 <Button>). 비어 있는 이유보다 무엇을 하면 되는지를 보여 준다. */
  action?: React.ReactNode;
  /** 선택. 장식이 아니라 내용을 구분하는 데 도움이 될 때만 쓴다. */
  icon?: React.ReactNode;
};

/** 목록·차트에 보여 줄 데이터가 없을 때. */
function EmptyState({ title, description, action, icon, className, ...props }: EmptyStateProps) {
  return (
    <div data-slot="empty-state" className={cn("flex flex-col items-center px-6 py-10 text-center", className)} {...props}>
      {icon && <div className="mb-3 text-muted-foreground [&_svg]:size-6">{icon}</div>}
      <p className="text-base font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
