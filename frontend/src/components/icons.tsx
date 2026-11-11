// Small inline SVG icons (no icon library needed).
type P = { className?: string };
const base = "h-4 w-4";
const svg = (path: React.ReactNode, viewBox = "0 0 24 24") =>
  function Icon({ className }: P) {
    return (
      <svg viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className ?? base} aria-hidden>
        {path}
      </svg>
    );
  };

export const PlusIcon = svg(<path d="M12 5v14M5 12h14" />);
export const ArrowUpIcon = svg(<path d="M12 19V5M5 12l7-7 7 7" />);
export const DownloadIcon = svg(<><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></>);
export const CopyIcon = svg(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>);
export const CheckIcon = svg(<path d="m5 12 5 5L20 7" />);
export const SparklesIcon = svg(<><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>);
export const MenuIcon = svg(<path d="M4 6h16M4 12h16M4 18h16" />);
export const CloseIcon = svg(<path d="M6 6l12 12M18 6 6 18" />);
export const LogOutIcon = svg(<><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></>);
export const ExpandIcon = svg(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />);
export const RefreshIcon = svg(<><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>);
export const ImageIcon = svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5L5 20" /></>);
export const LogoMark = ({ className }: P) => (
  <div className={`grid place-items-center rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 text-white shadow-lg shadow-fuchsia-500/20 ${className ?? "h-8 w-8"}`}>
    <SparklesIcon className="h-4 w-4" />
  </div>
);
