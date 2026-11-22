export type IconName = 'eye' | 'check' | 'x' | 'pencil' | 'trash' | 'download' | 'shield' | 'key';

const PATHS: Record<IconName, React.ReactNode> = {
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  x: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  pencil: (
    <>
      <path d="M4 20h4l11-11a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="m14.5 6.5 3 3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 19h16" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 5.5v5c0 4.5 3 8.6 7 10.5 4-1.9 7-6 7-10.5v-5L12 3Z" />
      <path d="m9 11.5 2.2 2.2L15.5 9.5" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="14" r="4" />
      <path d="m11 11 8-8" />
      <path d="m16 6 3 3" />
      <path d="m13.5 8.5 2.5 2.5" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  className?: string;
}

/** Ikon garis 20x20 (stroke currentColor), tanpa dependency eksternal. */
export function Icon({ name, className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
