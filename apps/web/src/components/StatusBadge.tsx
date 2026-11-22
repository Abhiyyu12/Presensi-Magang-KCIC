import {
  DAY_STATUS_COLORS,
  DAY_STATUS_LABELS,
  LEAVE_STATUS_COLORS,
  LEAVE_STATUS_LABELS,
} from '../lib/format';

export type BadgeKind = 'dayStatus' | 'leaveStatus' | 'neutral';

interface StatusBadgeProps {
  kind?: BadgeKind;
  status: string | null | undefined;
  label?: string;
}

const NEUTRAL = 'bg-slate-100 text-slate-700 border-slate-300';

export function StatusBadge({ kind = 'dayStatus', status, label }: StatusBadgeProps) {
  if (!status) {
    return (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${NEUTRAL}`}>
        {label ?? '-'}
      </span>
    );
  }
  const labels = kind === 'leaveStatus' ? LEAVE_STATUS_LABELS : DAY_STATUS_LABELS;
  const colors = kind === 'leaveStatus' ? LEAVE_STATUS_COLORS : DAY_STATUS_COLORS;
  const text = label ?? labels[status] ?? status;
  const color = colors[status] ?? NEUTRAL;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {text}
    </span>
  );
}
