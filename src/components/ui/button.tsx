import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 font-semibold whitespace-nowrap select-none",
    "transition-[color,background-color,border-color,opacity] duration-150 outline-none",
    "focus-visible:ring-[3px] focus-visible:ring-ring/40",
    "disabled:pointer-events-none disabled:opacity-45",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.125rem]",
  ],
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        brand: "bg-brand text-brand-foreground hover:bg-brand/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        outline: "border border-input bg-card text-foreground hover:bg-accent",
        ghost: "text-foreground hover:bg-accent",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        link: "text-brand underline-offset-4 hover:underline",
      },
      size: {
        // 36px 버튼은 보이는 크기만 작고, 터치 영역은 44px 로 넓힌다.
        sm: "h-9 rounded-lg px-3 text-sm after:absolute after:-inset-1 [&_svg:not([class*='size-'])]:size-4",
        default: "h-11 rounded-xl px-4 text-body",
        lg: "h-12 rounded-xl px-5 text-base",
        icon: "size-11 rounded-xl",
        "icon-sm": "size-9 rounded-lg after:absolute after:-inset-1",
      },
    },
    // 글자 링크는 보이는 크기 그대로 두고 터치 영역만 위아래로 넓힌다.
    compoundVariants: [{ variant: "link", className: "h-auto rounded-sm px-0 after:absolute after:-inset-x-1 after:-inset-y-3" }],
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** 자식 요소(예: <Link>)에 버튼 스타일을 입힌다. */
    asChild?: boolean;
    /** 저장 중 표시. 스피너를 보여 주고 누를 수 없게 한다. */
    loading?: boolean;
  };

function Button({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if (asChild) {
    return (
      <Slot.Root data-slot="button" className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      type="button"
      data-slot="button"
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
