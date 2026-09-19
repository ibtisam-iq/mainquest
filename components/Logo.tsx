// The mark: a map grid square with one placed office, the idea behind the location chips.
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="var(--logo-bg, #0f1f1a)" />
      <path d="M11 6v20M21 6v20M6 11h20M6 21h20" stroke="var(--logo-grid, rgba(255,255,255,0.16))" strokeWidth="1.25" />
      <circle cx="21" cy="11" r="4.2" fill="var(--logo-dot, #7fd1a6)" />
      <circle cx="21" cy="11" r="1.6" fill="var(--logo-bg, #0f1f1a)" />
    </svg>
  );
}
