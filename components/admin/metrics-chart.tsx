"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface MetricsPoint {
  day: string; // YYYY-MM-DD
  views: number;
  downloads: number;
}

const SERIES = [
  { key: "views", label: "Views", color: "var(--chart-views)" },
  { key: "downloads", label: "Downloads", color: "var(--chart-downloads)" },
] as const;

const HEIGHT = 260;
const PAD = { top: 16, right: 84, bottom: 28, left: 44 };

const dayLabel = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const fullDay = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

/** Clean y-axis ticks from 0 to just above the max: 0, 5, 10… or 0, 1K, 2K… */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) ticks.push(Math.round(v));
  return ticks;
}

/**
 * Views and downloads per day (section 9): two 2px lines on one count axis,
 * a legend and end labels for identity, a crosshair tooltip that follows the
 * pointer or the arrow keys, and a table view with every value.
 */
export function MetricsChart({ data }: { data: MetricsPoint[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const max = Math.max(0, ...data.flatMap((d) => [d.views, d.downloads]));
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1];
    const plotW = width - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
    const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
    const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(plotW / 80))));
    return { ticks, x, y, plotW, plotH, labelEvery };
  }, [data, width]);

  const { ticks, x, y, plotH, labelEvery } = geometry;
  const last = data.length - 1;
  const point = active === null ? null : data[active];

  // End labels: keep the two at least 14px apart vertically.
  const ends = SERIES.map((s) => ({ ...s, value: data[last]?.[s.key] ?? 0, y: y(data[last]?.[s.key] ?? 0) }));
  if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 14) {
    const mid = (ends[0].y + ends[1].y) / 2;
    const [hi, lo] = ends[0].y <= ends[1].y ? [0, 1] : [1, 0];
    ends[hi].y = mid - 7;
    ends[lo].y = mid + 7;
  }

  function pick(clientX: number) {
    const rect = wrap.current?.getBoundingClientRect();
    if (!rect || data.length === 0) return;
    const px = clientX - rect.left;
    let best = 0;
    for (let i = 1; i < data.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setActive(best);
  }

  const totals = {
    views: data.reduce((n, d) => n + d.views, 0),
    downloads: data.reduce((n, d) => n + d.downloads, 0),
  };

  return (
    <figure className="m-0">
      <ul className="flex flex-wrap gap-5 text-sm text-ink-muted" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-2">
            <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.label} <strong className="font-semibold text-ink">{totals[s.key].toLocaleString("en")}</strong>
          </li>
        ))}
      </ul>

      <div
        ref={wrap}
        className="relative mt-3 outline-none focus-visible:ring-2 focus-visible:ring-royal"
        tabIndex={0}
        role="img"
        aria-label={`Views and downloads per day${data.length ? `, ${fullDay.format(new Date(data[0].day))} to ${fullDay.format(new Date(data[last].day))}` : ""}: ${totals.views} views and ${totals.downloads} downloads in total. Use the arrow keys to read each day, or open the table below.`}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const step = e.key === "ArrowRight" ? 1 : -1;
            setActive((a) => Math.min(last, Math.max(0, (a ?? (step > 0 ? -1 : last + 1)) + step)));
          } else if (e.key === "Escape") setActive(null);
        }}
      >
        <svg width={width} height={HEIGHT} className="block max-w-full overflow-visible" aria-hidden>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--line)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-ink-muted text-[11px]"
              >
                {compact.format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            (i % labelEvery === 0 && x(last) - x(i) >= 56) || i === last ? (
              <text
                key={d.day}
                x={x(i)}
                y={HEIGHT - 8}
                textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"}
                className="fill-ink-muted text-[11px]"
              >
                {dayLabel.format(new Date(d.day))}
              </text>
            ) : null,
          )}

          {point ? (
            <line
              x1={x(active!)}
              x2={x(active!)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              stroke="var(--ink-muted)"
              strokeWidth={1}
            />
          ) : null}

          {SERIES.map((s) => (
            <polyline
              key={s.key}
              points={data.map((d, i) => `${x(i)},${y(d[s.key])}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {data.length > 0
            ? ends.map((s) => (
                <g key={s.key}>
                  <circle cx={x(last)} cy={y(s.value)} r={4} fill={s.color} stroke="white" strokeWidth={2} />
                  <text x={x(last) + 10} y={s.y} dy="0.32em" className="fill-ink text-[12px] font-medium">
                    {s.value.toLocaleString("en")} {s.label.toLowerCase()}
                  </text>
                </g>
              ))
            : null}

          {point
            ? SERIES.map((s) => (
                <circle
                  key={s.key}
                  cx={x(active!)}
                  cy={y(point[s.key])}
                  r={4}
                  fill={s.color}
                  stroke="white"
                  strokeWidth={2}
                />
              ))
            : null}
        </svg>

        {point ? (
          <div
            className="pointer-events-none absolute top-2 rounded-md border border-line bg-white px-3 py-2 text-sm shadow-md"
            style={x(active!) > width / 2 ? { right: width - x(active!) + 12 } : { left: x(active!) + 12 }}
            aria-live="polite"
          >
            <p className="text-xs text-ink-muted">{fullDay.format(new Date(point.day))}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="mt-1 flex items-center gap-2 whitespace-nowrap">
                <span
                  aria-hidden
                  className="inline-block h-0.5 w-3 rounded"
                  style={{ background: s.color }}
                />
                <strong className="font-semibold text-ink">{point[s.key].toLocaleString("en")}</strong>
                <span className="text-ink-muted">{s.label.toLowerCase()}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-medium text-navy">Show as a table</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-md border border-line">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-paper text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 text-right font-medium">Views</th>
                <th className="px-3 py-2 text-right font-medium">Downloads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((d) => (
                <tr key={d.day}>
                  <td className="px-3 py-1.5">{fullDay.format(new Date(d.day))}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.views.toLocaleString("en")}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.downloads.toLocaleString("en")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
