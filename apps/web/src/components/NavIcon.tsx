interface NavIconProps {
  route: string;
  className?: string;
}

const PATHS: Record<string, string> = {
  '/': 'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
  '/absensi': 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  '/izin': 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  '/riwayat': 'M12 21a9 9 0 1 0-9-9M3 12H1m2 0 2-2m-2 2 2 2M12 7v5l3 3',
  '/monitoring': 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  '/approval': 'M4 12.5 9.5 18 20 6',
  '/reports': 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  '/master': 'M3 6h7l2 2h9v12H3zM3 6v14',
  '/access': 'M8 11V8a4 4 0 0 1 8 0v3M5 11h14v9H5zM12 15v2',
  '/audit': 'M6 2h9l4 4v16H6zM15 2v4h4M9 11h6M9 15h6M9 19h4',
  '/bantuan': 'M12 21a9 9 0 1 0-9-9 9 9 0 0 0 9 9zM9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.7.3-.9.8-.9 1.7M12 17h.01',
  '/profil': 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
};

export function NavIcon({ route, className = 'h-5 w-5' }: NavIconProps) {
  const d = PATHS[route] ?? 'M12 12h.01';
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

export function MenuIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}