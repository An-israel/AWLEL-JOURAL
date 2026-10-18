"use client";

import { X } from "lucide-react";
import { AlertDialog as AD, Dialog as D } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

const overlay = "fixed inset-0 z-50 bg-ink/50";
const panel =
  "fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-line bg-white p-6 shadow-2xl";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ className, children, ...props }: ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Overlay className={overlay} />
      <D.Content className={cn(panel, className)} {...props}>
        {children}
        <D.Close
          className="absolute top-4 right-4 rounded-sm p-1 text-ink-muted hover:text-ink"
          aria-label="Close"
        >
          <X aria-hidden className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}

export function DialogHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="space-y-1.5 pr-6">
      <D.Title className="text-lg font-semibold">{title}</D.Title>
      {description ? <D.Description className="text-sm text-ink-muted">{description}</D.Description> : null}
    </div>
  );
}

/**
 * Confirmation dialog for destructive actions (section 10). `onConfirm`
 * runs only when the person explicitly confirms.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  confirmDisabled = false,
  onConfirm,
  open,
  onOpenChange,
}: {
  trigger?: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Keeps the confirm button disabled, e.g. until a required box is ticked. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <AD.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <AD.Trigger asChild>{trigger}</AD.Trigger> : null}
      <AD.Portal>
        <AD.Overlay className={overlay} />
        <AD.Content className={panel}>
          <div className="space-y-1.5">
            <AD.Title className="text-lg font-semibold">{title}</AD.Title>
            <AD.Description className="text-sm text-ink-muted">{description}</AD.Description>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AD.Cancel className={buttonVariants({ variant: "outline" })}>Cancel</AD.Cancel>
            <AD.Action
              className={buttonVariants({ variant: destructive ? "destructive" : "default" })}
              disabled={confirmDisabled}
              onClick={onConfirm}
            >
              {confirmLabel}
            </AD.Action>
          </div>
        </AD.Content>
      </AD.Portal>
    </AD.Root>
  );
}
