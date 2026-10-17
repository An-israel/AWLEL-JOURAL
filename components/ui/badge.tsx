import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-[#E8EDFA] text-navy",
        gold: "bg-[#FBF3E4] text-[#7A4F18]",
        coral: "bg-[#FDECEF] text-[#A3283C]",
        green: "bg-[#EAF5E6] text-[#2F6B22]",
        muted: "bg-paper text-ink-muted ring-1 ring-line",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
