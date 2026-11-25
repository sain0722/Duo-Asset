import * as React from "react";

import { fieldClassName } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClassName, "field-sizing-content min-h-24 resize-none px-3.5 py-3 leading-relaxed", className)}
      {...props}
    />
  );
}

export { Textarea };
