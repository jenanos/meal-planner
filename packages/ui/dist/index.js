// src/components/Button.tsx
import * as React from "react";

// src/lib/cn.ts
import { twMerge } from "tailwind-merge";
import { clsx } from "clsx";
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// src/lib/button-variants.ts
import { cva } from "class-variance-authority";
var buttonVariants = cva(
  "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-gray-900 text-white hover:bg-gray-800",
        outline: "border border-gray-300 hover:bg-gray-50",
        ghost: "hover:bg-gray-100"
      },
      size: { sm: "h-8 px-3", md: "h-10 px-4", lg: "h-12 px-6" }
    },
    defaultVariants: { variant: "default", size: "md" }
  }
);

// src/components/Button.tsx
import { jsx } from "react/jsx-runtime";
var Button = React.forwardRef(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    return /* @__PURE__ */ jsx(
      "button",
      {
        className: cn(buttonVariants({ variant, size }), className),
        ref,
        ...props
      }
    );
  }
);
Button.displayName = "Button";
export {
  Button,
  cn
};
//# sourceMappingURL=index.js.map