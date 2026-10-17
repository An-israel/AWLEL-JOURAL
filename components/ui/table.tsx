import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-line bg-white">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}
export const THead = (p: ComponentProps<"thead">) => (
  <thead className="border-b border-line bg-paper/70" {...p} />
);
export const TBody = (p: ComponentProps<"tbody">) => <tbody className="divide-y divide-line" {...p} />;
export const Tr = ({ className, ...p }: ComponentProps<"tr">) => (
  <tr className={cn("hover:bg-paper/50", className)} {...p} />
);
export const Th = ({ className, ...p }: ComponentProps<"th">) => (
  <th
    className={cn(
      "h-10 px-4 text-left align-middle text-xs font-semibold tracking-wide text-ink-muted uppercase",
      className,
    )}
    {...p}
  />
);
export const Td = ({ className, ...p }: ComponentProps<"td">) => (
  <td className={cn("px-4 py-3 align-middle", className)} {...p} />
);
