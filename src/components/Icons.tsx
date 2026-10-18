// Simple line icons, drawn to match each other.

const common = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const PlannerIcon = () => (
  <svg {...common}>
    <path d="M3 19h18" />
    <path d="M4 16c3-1 5-4 8-6s5-4 8-6" />
    <circle cx="12" cy="10" r="1.6" />
  </svg>
)
export const MarketsIcon = () => (
  <svg {...common}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
)
export const InflationIcon = () => (
  <svg {...common}>
    <circle cx="12" cy="12" r="8" />
    <path d="M14.5 9.2c-.6-.8-1.5-1.2-2.6-1.2-1.6 0-2.7.8-2.7 2s1 1.7 2.8 2.1c1.8.4 2.8 1 2.8 2.2s-1.2 2-2.8 2c-1.2 0-2.2-.5-2.8-1.3M12 6.5V8M12 16.3v1.2" />
  </svg>
)
export const SavedIcon = () => (
  <svg {...common}>
    <path d="M6 3h12v18l-6-4-6 4z" />
  </svg>
)
export const SettingsIcon = () => (
  <svg {...common}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </svg>
)
export const GripIcon = () => (
  <svg {...common} width={20} height={20} strokeWidth={0} fill="currentColor">
    {[7, 12, 17].map((y) => (
      <g key={y}>
        <circle cx="9" cy={y} r="1.4" />
        <circle cx="15" cy={y} r="1.4" />
      </g>
    ))}
  </svg>
)
export const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg {...common} width={18} height={18} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 200ms ease' }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)
export const PlusIcon = () => (
  <svg {...common} width={18} height={18}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const CopyIcon = () => (
  <svg {...common} width={18} height={18}>
    <rect x="8" y="8" width="12" height="12" rx="2.5" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
)
export const TrashIcon = () => (
  <svg {...common} width={18} height={18}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
)
export const DownloadIcon = () => (
  <svg {...common} width={18} height={18}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
)
