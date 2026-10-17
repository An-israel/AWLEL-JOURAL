"use client";

import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Reorderable list: drag the handle with a mouse, or use the arrow buttons
 * (keyboard and screen-reader friendly). Calls onChange with the new order.
 */
export function SortableList<T>({
  items,
  getId,
  getLabel,
  onChange,
  render,
  disabled,
}: {
  items: T[];
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  onChange: (items: T[]) => void;
  render: (item: T, index: number) => ReactNode;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  return (
    <ol className="divide-y divide-line rounded-lg border border-line bg-white">
      {items.map((item, i) => (
        <li
          key={getId(item)}
          draggable={!disabled}
          onDragStart={(e) => {
            setDragging(i);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(i);
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging !== null) move(dragging, i);
            setDragging(null);
            setOver(null);
          }}
          onDragEnd={() => {
            setDragging(null);
            setOver(null);
          }}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5",
            dragging === i && "opacity-50",
            over === i && dragging !== i && "bg-[#E8EDFA]",
          )}
        >
          <span aria-hidden className={cn("text-ink-muted", disabled ? "opacity-40" : "cursor-grab")}>
            <GripVertical className="size-4" />
          </span>
          <div className="min-w-0 flex-1">{render(item, i)}</div>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              disabled={disabled || i === 0}
              onClick={() => move(i, i - 1)}
              className="rounded p-1.5 text-ink-muted hover:bg-paper hover:text-navy disabled:opacity-30"
              aria-label={`Move ${getLabel(item)} up`}
            >
              <ArrowUp aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              disabled={disabled || i === items.length - 1}
              onClick={() => move(i, i + 1)}
              className="rounded p-1.5 text-ink-muted hover:bg-paper hover:text-navy disabled:opacity-30"
              aria-label={`Move ${getLabel(item)} down`}
            >
              <ArrowDown aria-hidden className="size-4" />
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}
