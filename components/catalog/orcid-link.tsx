export function OrcidLink({ orcid, name }: { orcid: string; name: string }) {
  return (
    <a
      href={`https://orcid.org/${orcid}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex align-middle"
      aria-label={`ORCID profile of ${name} (opens in a new tab)`}
      title={`ORCID ${orcid}`}
    >
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <circle cx="12" cy="12" r="12" fill="#A6CE39" />
        <path
          fill="#fff"
          d="M8.3 18.1H6.9V8.4h1.4zm-.7-11.2a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8M10.3 8.4h3.8c3.6 0 5.2 2.6 5.2 4.9 0 2.5-1.9 4.9-5.2 4.9h-3.8zm1.4 8.5h2.3c3.2 0 3.9-2.4 3.9-3.6 0-2-1.3-3.6-3.9-3.6h-2.3z"
        />
      </svg>
    </a>
  );
}
