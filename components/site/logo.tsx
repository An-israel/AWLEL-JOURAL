/**
 * PLACEHOLDER MARK — a simple globe-with-open-book drawing until the official
 * AWLEL logo files are supplied. Replace with the supplied SVG (keep the
 * `className`/`title` props) or upload a logo in Admin → Settings.
 */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="24" cy="19" r="15" />
        <ellipse cx="24" cy="19" rx="6.5" ry="15" />
        <path d="M9 19h30M11.5 11h25M11.5 27h25" />
      </g>
      <path
        d="M5 33.5c6.5-3 13-2.6 19 1.2 6-3.8 12.5-4.2 19-1.2V44c-6.5-3-13-2.6-19 1.2C18 41.4 11.5 41 5 44z"
        fill="currentColor"
      />
      <path d="M24 34.7v10.5" stroke="var(--gold)" strokeWidth="1.6" />
    </svg>
  );
}
