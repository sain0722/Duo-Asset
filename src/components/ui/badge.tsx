import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-6 shrink-0 items-center gap-1 rounded-sm px-2 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        neutral: "bg-secondary text-secondary-foreground",
        outline: "border border-input text-muted-foreground",
        solid: "bg-primary text-primary-foreground",
        brand: "bg-brand/12 text-brand dark:bg-brand/16",
        up: "bg-up/10 text-up dark:bg-up/16",
        down: "bg-down/10 text-down dark:bg-down/16",
        warning: "bg-warning/16 text-warning-foreground",
        destructive: "bg-destructive/10 text-destructive dark:bg-destructive/16",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
