"use client";

import { Download, Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

/*
 * Reads a published PDF on the site itself (article or full issue), page by
 * page, on computers and phones alike: PDF.js draws each page, with its text
 * selectable over it. Nothing loads until the reader comes into view, and a
 * page is drawn only when it is near the screen, so long issues stay light.
 * Reading is not downloading: the file comes from the `inline` link, which
 * isn't counted, and Download stays a separate choice.
 *
 * The file is fetched in one go (no range requests): the link redirects to a
 * short-lived signed address, which later range requests couldn't reuse.
 */

type Pdfjs = typeof import("pdfjs-dist");

const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2] as const;

interface PageSize {
  width: number;
  height: number;
}

let pdfjsPromise: Promise<Pdfjs> | null = null;

const noSubscribe = () => () => {};

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

/**
 * PDF.js loads on first use only, with its worker served from the site. The
 * "legacy" build adds the newest JavaScript features it relies on, so older
 * phones and browsers can read too.
 */
function loadPdfjs(): Promise<Pdfjs> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    return pdfjs;
  });
  return pdfjsPromise;
}

export function PdfReader({
  src,
  title,
  heading,
  downloadHref,
  id = "read",
}: {
  /** The inline (not counted) address of the PDF. */
  src: string;
  title: string;
  heading: string;
  downloadHref?: string;
  id?: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [wanted, setWanted] = useState(false);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoomIndex, setZoomIndex] = useState(2);
  const [width, setWidth] = useState(0);
  const [current, setCurrent] = useState(1);
  // Phones without full-screen support (iPhone Safari) don't get the button.
  const canFullscreen = useSyncExternalStore(
    noSubscribe,
    () => Boolean(document.fullscreenEnabled),
    () => false,
  );
  const fullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => document.fullscreenElement !== null && document.fullscreenElement === frameRef.current,
    () => false,
  );

  // Start loading only when the reader is about to be seen.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setWanted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    let task: ReturnType<Pdfjs["getDocument"]> | null = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        if (cancelled) return;
        task = pdfjs.getDocument({ url: src, disableRange: true });
        task.onProgress = ({ loaded: got, total }: { loaded: number; total: number }) => {
          if (!cancelled && total) setProgress(Math.min(1, got / total));
        };
        const loaded = await task.promise;
        // Page sizes up front, so the layout doesn't jump as pages are drawn.
        const all: PageSize[] = [];
        for (let n = 1; n <= loaded.numPages; n++) {
          const viewport = (await loaded.getPage(n)).getViewport({ scale: 1 });
          all.push({ width: viewport.width, height: viewport.height });
        }
        if (cancelled) return;
        setSizes(all);
        setDoc(loaded);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [wanted, src]);

  // Pages fit the reader's width at 100%.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [doc]);

  const fitScale = useCallback(
    (size: PageSize) => {
      // 100% fits the reader's width, up to about a printed page's width on a big screen.
      const usable = Math.min(860, Math.max(240, width - 32));
      return (usable / size.width) * ZOOMS[zoomIndex];
    },
    [width, zoomIndex],
  );

  // Which page is on screen, for "Page 3 of 18".
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !doc) return;
    const onScroll = () => {
      const pages = scroller.querySelectorAll<HTMLElement>("[data-page]");
      const middle = scroller.scrollTop + scroller.clientHeight / 3;
      let n = 1;
      for (const p of pages) if (p.offsetTop <= middle) n = Number(p.dataset.page);
      setCurrent(n);
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [doc]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frameRef.current?.requestFullscreen().catch(() => {});
  };

  const goTo = (n: number) => {
    const page = scrollerRef.current?.querySelector<HTMLElement>(`[data-page="${n}"]`);
    if (page && scrollerRef.current) scrollerRef.current.scrollTop = page.offsetTop - 12;
  };

  const button =
    "inline-flex size-9 items-center justify-center rounded-md text-ink hover:bg-paper disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <section
      ref={sectionRef}
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-32 rounded-lg border border-line bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 id={`${id}-title`} className="text-xl">
          {heading}
        </h2>
        {downloadHref ? (
          <a
            href={downloadHref}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy no-underline hover:text-royal"
          >
            <Download aria-hidden className="size-4" />
            Download PDF
          </a>
        ) : null}
      </div>

      <div ref={frameRef} className="flex flex-col bg-[#E9EBF0] [&:fullscreen]:h-screen">
        <div
          role="toolbar"
          aria-label="Reader controls"
          className="flex items-center justify-between gap-2 border-b border-line bg-white px-3 py-1.5"
        >
          <p className="px-2 text-sm text-ink-muted tabular-nums" aria-live="polite">
            {doc ? (
              <>
                Page{" "}
                <label className="sr-only" htmlFor={`${id}-page`}>
                  Go to page
                </label>
                <input
                  id={`${id}-page`}
                  type="number"
                  min={1}
                  max={doc.numPages}
                  value={current}
                  onChange={(e) => {
                    const n = Math.min(doc.numPages, Math.max(1, Number(e.target.value) || 1));
                    setCurrent(n);
                    goTo(n);
                  }}
                  className="w-12 rounded border border-line px-1 py-0.5 text-center text-ink"
                />{" "}
                of {doc.numPages}
              </>
            ) : (
              "Loading…"
            )}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={button}
              onClick={() => setZoomIndex((z) => Math.max(0, z - 1))}
              disabled={!doc || zoomIndex === 0}
              aria-label="Zoom out"
            >
              <ZoomOut aria-hidden className="size-5" />
            </button>
            <span className="w-12 text-center text-sm text-ink-muted tabular-nums">
              {Math.round(ZOOMS[zoomIndex] * 100)}%
            </span>
            <button
              type="button"
              className={button}
              onClick={() => setZoomIndex((z) => Math.min(ZOOMS.length - 1, z + 1))}
              disabled={!doc || zoomIndex === ZOOMS.length - 1}
              aria-label="Zoom in"
            >
              <ZoomIn aria-hidden className="size-5" />
            </button>
            {canFullscreen ? (
              <button
                type="button"
                className={button}
                onClick={toggleFullscreen}
                aria-label={fullscreen ? "Leave full screen" : "Read full screen"}
              >
                {fullscreen ? (
                  <Minimize2 aria-hidden className="size-5" />
                ) : (
                  <Maximize2 aria-hidden className="size-5" />
                )}
              </button>
            ) : null}
          </div>
        </div>

        <div
          ref={scrollerRef}
          className={`relative overflow-auto overscroll-contain ${fullscreen ? "flex-1" : "h-[78vh] max-h-[1100px] min-h-[420px]"}`}
          tabIndex={0}
          aria-label={`Pages of ${title}`}
        >
          {failed ? (
            <p className="p-8 text-center text-ink-muted">
              The PDF couldn&apos;t be shown here.{" "}
              {downloadHref ? (
                <a href={downloadHref} className="font-semibold">
                  Download it
                </a>
              ) : null}{" "}
              {downloadHref ? "or " : ""}
              <a href={src} target="_blank" rel="noopener" className="font-semibold">
                open it in a new tab
              </a>
              .
            </p>
          ) : !doc ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-ink-muted">
              <p>{wanted ? "Opening the PDF…" : "The PDF opens here."}</p>
              {progress !== null ? (
                <div
                  className="h-1.5 w-56 overflow-hidden rounded-full bg-white"
                  role="progressbar"
                  aria-label="Loading the PDF"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                >
                  <div
                    className="h-full bg-navy transition-[width]"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex min-w-fit flex-col items-center gap-4 p-4">
              {sizes.map((size, i) => (
                <Page
                  key={i}
                  doc={doc}
                  number={i + 1}
                  size={size}
                  scale={fitScale(size)}
                  root={scrollerRef}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** One page: drawn when it comes near the screen, cleared when far away. */
function Page({
  doc,
  number,
  size,
  scale,
  root,
}: {
  doc: PDFDocumentProxy;
  number: number;
  size: PageSize;
  scale: number;
  root: React.RefObject<HTMLDivElement | null>;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => setNear(entries[0]?.isIntersecting ?? false), {
      root: root.current,
      rootMargin: "1200px 0px",
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const text = textRef.current;
    if (!near || !canvas || !text) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    let page: PDFPageProxy | null = null;
    (async () => {
      const pdfjs = await loadPdfjs();
      page = await doc.getPage(number);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      task = page.render({
        canvas,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      try {
        await task.promise;
      } catch {
        return; // cancelled by a zoom or by scrolling away
      }
      if (cancelled) return;
      text.replaceChildren();
      const layer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: text,
        viewport,
      });
      await layer.render().catch(() => {});
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, doc, number, scale]);

  // Far-away pages give their memory back.
  useEffect(() => {
    if (near) return;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    textRef.current?.replaceChildren();
  }, [near]);

  const w = Math.floor(size.width * scale);
  const h = Math.floor(size.height * scale);
  return (
    <div
      ref={boxRef}
      data-page={number}
      className="relative shrink-0 bg-white shadow-[0_1px_4px_rgb(0_0_0/0.18)]"
      style={{ width: w, height: h, "--total-scale-factor": scale } as CSSProperties}
    >
      <canvas ref={canvasRef} aria-label={`Page ${number}`} role="img" style={{ width: w, height: h }} />
      <div ref={textRef} className="textLayer" />
    </div>
  );
}
