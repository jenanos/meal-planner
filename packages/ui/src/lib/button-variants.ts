import { cva } from "class-variance-authority";

export const buttonVariants = cva(
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
