export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 12c3.2 2 12.8 2 16 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M8 20c3.2-2 12.8-2 16 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M16 7.5v17" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
