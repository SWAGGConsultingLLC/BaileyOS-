import React from 'react';

function LinkedInMark() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" focusable="false">
      <rect width="24" height="24" rx="3" fill="white" />
      <path fill="#0A66C2" d="M6.1 9.2H3.6V20h2.5V9.2zM4.85 3.6C4 3.6 3.3 4.3 3.3 5.15s.7 1.55 1.55 1.55 1.55-.7 1.55-1.55S5.7 3.6 4.85 3.6zM20.4 13.4c0-2.9-1.55-4.25-3.62-4.25-1.67 0-2.42.92-2.84 1.56V9.2H11.5c.03.7 0 10.8 0 10.8h2.5v-6.03c0-.32.02-.65.12-.88.26-.65.86-1.32 1.86-1.32 1.31 0 1.84 1 1.84 2.46V20H20.4v-6.6z" />
    </svg>
  );
}

export function LinkedInButton({ href, label, onClick }: { href: string; label: string; onClick?: () => void }) {
  return (
    <a
      href={href}
      aria-label={label}
      onClick={onClick}
      className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full bg-[#0A66C2] px-4 text-center text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <LinkedInMark />
      {label}
    </a>
  );
}
