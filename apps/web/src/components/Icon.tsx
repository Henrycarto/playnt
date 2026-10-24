const paths = {
  serious: <><path d="M8 1.75 14.75 13.5H1.25L8 1.75Z" strokeLinejoin="round" /><path d="M8 6.25v3.5M8 11.4v.1" strokeLinecap="round" /></>,
  check: <path d="m3 8.5 3.25 3.25L13 5" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />,
  pen: <path d="M10.5 2.5 13.5 5.5 6 13H3v-3l7.5-7.5Z" strokeLinejoin="round" />,
  suggested: <circle cx="8" cy="8" r="5.75" strokeDasharray="2.5 2" />,
  manual: <><circle cx="8" cy="8" r="6" /><path d="M8 4.75v4M8 11v.1" strokeLinecap="round" /></>,
  clock: <><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" strokeLinecap="round" /></>,
  back: <path d="M10 3 5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />,
  plus: <path d="M8 3v10M3 8h10" strokeWidth="1.75" strokeLinecap="round" />,
  queue: <path d="M2.5 4h11M2.5 8h11M2.5 12h7" strokeLinecap="round" />,
  log: <><rect x="3" y="2" width="10" height="12" rx="1.5" /><path d="M6 6h4M6 9h4" strokeLinecap="round" /></>,
  trend: <path d="M2.5 13.5h11M4 11V8M7 11V5M10 11V7M13 11V3.5" strokeLinecap="round" />,
  audit: <path d="M3 3.5h10M3 8h10M3 12.5h10" strokeLinecap="round" strokeDasharray="1.5 2.5" />,
  source: <><path d="M4 2.5h6l2.5 2.5v8.5H4z" strokeLinejoin="round" /><path d="M6.5 8h4M6.5 10.5h4" strokeLinecap="round" /></>,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}
