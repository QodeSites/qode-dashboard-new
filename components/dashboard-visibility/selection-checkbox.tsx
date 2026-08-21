"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

// Styled checkbox scoped to the dashboard-visibility admin page's row/
// select-all UI. Kept separate from components/ui/checkbox.tsx rather than
// restyling that shared primitive, since other pages may rely on its
// current plain look.
const SelectionCheckbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer group h-[18px] w-[18px] shrink-0 rounded-[5px] border-2 border-logo-green/30 bg-white shadow-sm ring-offset-background transition-colors hover:border-logo-green/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-logo-green/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-logo-green data-[state=checked]:bg-logo-green data-[state=checked]:text-[#8FCBA6] data-[state=indeterminate]:border-logo-green data-[state=indeterminate]:bg-logo-green data-[state=indeterminate]:text-[#8FCBA6]",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      <Check className="h-3.5 w-3.5 group-data-[state=indeterminate]:hidden" />
      <Minus className="hidden h-3.5 w-3.5 group-data-[state=indeterminate]:block" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
SelectionCheckbox.displayName = "SelectionCheckbox";

export { SelectionCheckbox };
