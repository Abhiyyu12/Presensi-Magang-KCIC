import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isRecord } from '../lib/types';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { MasterCombobox } from '../components/MasterCombobox';
import { fetchBureauOptions, fetchDivisionOptions } from './master/options';

type TimeMode = 'today' | 'date' | 'range' | 'month' | 'year';

const TIME_MODES: { value: TimeMode; label: string }[] = [
  { value: 'today', label: 'Hari ini' },
  { value: 'date', label: 'Tanggal' },
  { value: 'range', label: 'Rentang' },
  { value: 'month', label: 'Bulan' },
  { value: 'year', label: 'Tahun' },
];

interface SeriesPoint {
  date: string;
  scheduled: number;
  checkedIn: number;
  late: number;
  needsReview: number;
}

function rangeLabel(mode: TimeMode, date: string, from: string, to: string, month: string, year: string): string {
  if (mode === 'today') return 'Hari ini';
  if (mode === 'date') return `Tanggal ${date || '-'}`;
  if (mode === 'range') return `Rentang ${from || '-'} s.d. ${to || '-'}`;
  if (mode === 'month') return `Bulan ${month || '-'}`;
  return `Tahun ${year || '-'}`;
}

/** Grafik batang harian: hadir vs terlambat, warna brand KCIC. */
function AttendanceBarChart({ series }: { series: SeriesPoint[] }) {
  const width = 720;
  const height = 220;
  const pad = { top: 12, right: 8, bottom: 28, left: 32 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...series.map((s) => Math.max(s.checkedIn, s.late, s.scheduled)));
  const slot = innerW / Math.max(1, series.length);
  const barW = Math.max(4, Math.min(14, slot / 2.6));
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const labelEvery = Math.ceil(series.length / 12);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-56 w-full"
      role="img"
      aria-label="Grafik kehadiran harian"
      preserveAspectRatio="none"
    >
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={pad.left} x2={width - pad.right} y1={y(max * t)} y2={y(max * t)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={pad.left - 6} y={y(max * t) + 4} textAnchor="end" fontSize="10" fill="#64748b">
            {Math.round(max * t)}
          </text>
        </g>
      ))}
      {series.map((s, i) => {
        const cx = pad.left + slot * i + slot / 2;
        return (
          <g key={s.date}>
            <title>{`${s.date}: hadir ${s.checkedIn}, terlambat ${s.late}, terjadwal ${s.scheduled}`}</title>
            <rect
              x={cx - barW - 1}
              y={y(s.checkedIn)}
              width={barW}
              height={Math.max(0, pad.top + innerH - y(s.checkedIn))}
              rx="2"
              fill="#8b1a1a"
            >
              <title>{`${s.date}: hadir ${s.checkedIn}`}</title>
            </rect>
            <rect
              x={cx + 1}
              y={y(s.late)}
              width={barW}
              height={Math.max(0, pad.top + innerH - y(s.late))}
              rx="2"
              fill="#d97706"
            >
              <title>{`${s.date}: terlambat ${s.late}`}</title>
            </rect>
            {i % labelEvery === 0 ? (
              <text x={cx} y={height - 8} textAnchor="middle" fontSize="10" fill="#64748b">
                {s.date.slice(5)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** Grafik donat distribusi hari kerja pada rentang terpilih. */
function DistributionDonut({
  onTime,
  late,
  needsReview,
  absent,
}: {
  onTime: number;
  late: number;
  needsReview: number;
  absent: number;
}) {
  const total = onTime + late + needsReview + absent;
  const segments = [
    { label: 'Hadir tepi waktu', value: onTime, color: '#8b1a1a' },
    { label: 'Terlambat', value: late, color: '#d97706' },
    { label: 'Perlu review', value: needsReview, color: '#dc2626' },
    { label: 'Tidak hadir', value: absent, color: '#cbd5e1' },
  ].filter((s) => s.value > 0);
  const r = 52;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-around">
      <svg viewBox="0 0 140 140" className="h-40 w-40" role="img" aria-label="Distribusi hari kerja">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#f1f5f9" strokeWidth="16" />
        {total === 0 ? (
          <text x="70" y="74" textAnchor="middle" fontSize="10" fill="#64748b">
            Tidak ada data
          </text>
        ) : (
          segments.map((s) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={s.label}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="16"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 70 70)"
              >
                <title>{`${s.label}: ${s.value}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })
        )}
      </svg>
      <ul className="space-y-1 text-xs text-slate-600">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3 w-3 rounded" style={{ backgroundColor: s.color }} />
            <span>{s.label}</span>
            <span className="font-semibold text-slate-800">{s.value}</span>
          </li>
        ))}
        {total === 0 ? <li className="text-slate-500">Belum ada data pada rentang ini.</li> : null}
      </ul>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { has } = useAuth();
  const [mode, setMode] = useState<TimeMode>('today');
  const [date, setDate] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [bureauId, setBureauId] = useState('');
  const [bureauLabel, setBureauLabel] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [divisionLabel, setDivisionLabel] = useState('');

  // Filter organisasi hanya untuk pengguna yang berhak melihat data master org.
  const canFilterOrg = has('admin:org:manage') || has('admin:users:manage');

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (bureauId) p.bureauId = bureauId;
    if (divisionId) p.divisionId = divisionId;
    if (mode === 'date' && date) p.date = date;
    if (mode === 'range' && from && to) {
      p.from = from;
      p.to = to;
    }
    if (mode === 'month' && month) p.month = month;
    if (mode === 'year' && year) p.year = year;
    return p;
  }, [mode, date, from, to, month, year, bureauId, divisionId]);

  const dashQuery = useQuery({
    queryKey: ['dashboard', 'admin', params],
    queryFn: () => api<unknown>(`/dashboard/admin?${new URLSearchParams(params).toString()}`),
  });

  if (dashQuery.isLoading) return <LoadingState label="Memuat dashboard admin…" />;
  if (dashQuery.isError) {
    return (
      <ErrorState
        message={dashQuery.error instanceof Error ? dashQuery.error.message : 'Gagal memuat.'}
        onRetry={() => void dashQuery.refetch()}
      />
    );
  }

  const raw = isRecord(dashQuery.data) ? dashQuery.data : {};
  const counts = isRecord(raw['counts']) ? raw['counts'] : {};
  const num = (key: string): number | undefined =>
    typeof counts[key] === 'number' ? (counts[key] as number) : undefined;
  const range = isRecord(raw['range'])
    ? { from: String(raw['range']['from'] ?? ''), to: String(raw['range']['to'] ?? '') }
    : { from: '', to: '' };
  const series = Array.isArray(raw['series'])
    ? (raw['series'] as unknown[]).filter(isRecord).map((s) => ({
        date: String(s['date'] ?? ''),
        scheduled: typeof s['scheduled'] === 'number' ? s['scheduled'] : 0,
        checkedIn: typeof s['checkedIn'] === 'number' ? s['checkedIn'] : 0,
        late: typeof s['late'] === 'number' ? s['late'] : 0,
        needsReview: typeof s['needsReview'] === 'number' ? s['needsReview'] : 0,
      }))
    : [];

  const canMonitoring = has('attendance:view:scoped') || has('report:view');
  const canApproval = has('leave:approve');
  const canReports = has('report:view');
  const canMaster = [
    'admin:users:manage',
    'admin:org:manage',
    'admin:placements:manage',
    'admin:assignments:manage',
    'admin:schedules:manage',
    'admin:calendar:manage',
    'admin:leave-categories:manage',
    'admin:params:manage',
  ].some(has);

  const cards: { label: string; value: number | undefined; to?: string }[] = [
    { label: 'Izin menunggu approval', value: num('pendingLeaves'), to: canApproval ? '/approval' : undefined },
    { label: 'Perlu review', value: num('needsReview'), to: canMonitoring ? '/monitoring' : undefined },
    { label: 'Terjadwal', value: num('scheduled') },
    { label: 'Hadir', value: num('checkedIn') },
    { label: 'Terlambat', value: num('late') },
    { label: 'Izin belum kembali', value: num('staleLeaves'), to: canApproval ? '/approval' : undefined },
  ];

  const checkedIn = num('checkedIn') ?? 0;
  const lateCount = num('late') ?? 0;
  const onTime = Math.max(0, checkedIn - lateCount);
  const absent = Math.max(0, (num('scheduled') ?? 0) - checkedIn);
  const hasData = series.some((s) => s.checkedIn > 0 || s.late > 0 || s.needsReview > 0) ||
    checkedIn > 0 || lateCount > 0 || absent > 0 || (num('needsReview') ?? 0) > 0;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Beranda Admin</h1>
        <p className="text-sm text-slate-600">
          Ringkasan operasional — {rangeLabel(mode, date, from, to, month, year)} (dihitung server).
        </p>
      </header>

      {/* Filter: sumber datanya backend, kartu + grafik mengikuti filter. */}
      <section aria-label="Filter dashboard" className="card space-y-3">
        <div className="flex flex-wrap gap-2">
          {TIME_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mode === m.value}
              onClick={() => setMode(m.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                mode === m.value
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {mode === 'date' ? (
            <div className="col-span-2 sm:col-span-1">
              <label className="label" htmlFor="dash-date">Tanggal</label>
              <input id="dash-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          ) : null}
          {mode === 'range' ? (
            <>
              <div>
                <label className="label" htmlFor="dash-from">Dari</label>
                <input id="dash-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="dash-to">Sampai</label>
                <input id="dash-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          ) : null}
          {mode === 'month' ? (
            <div className="col-span-2 sm:col-span-1">
              <label className="label" htmlFor="dash-month">Bulan</label>
              <input id="dash-month" type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          ) : null}
          {mode === 'year' ? (
            <div className="col-span-2 sm:col-span-1">
              <label className="label" htmlFor="dash-year">Tahun</label>
              <input
                id="dash-year"
                type="number"
                min={2000}
                max={2100}
                className="input"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
          ) : null}
          {canFilterOrg ? (
            <>
              <MasterCombobox
                id="dash-bureau"
                label="Biro"
                value={bureauId}
                valueLabel={bureauLabel}
                onChange={(value, label) => {
                  setBureauId(value);
                  setBureauLabel(value ? label : '');
                  setDivisionId('');
                  setDivisionLabel('');
                }}
                fetchOptions={fetchBureauOptions}
                serverSearch
                allowClear
              />
              <MasterCombobox
                id="dash-division"
                label="Divisi"
                value={divisionId}
                valueLabel={divisionLabel}
                onChange={(value, label) => {
                  setDivisionId(value);
                  setDivisionLabel(value ? label : '');
                }}
                fetchOptions={(search) => fetchDivisionOptions(search, bureauId)}
                serverSearch
                allowClear
              />
            </>
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="card">
            <p className="text-2xl font-bold text-slate-900">
              {card.value !== undefined ? card.value : '-'}
            </p>
            <p className="mt-1 text-xs text-slate-500">{card.label}</p>
            {card.to ? (
              <Link to={card.to} className="mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline">
                Buka
              </Link>
            ) : null}
          </div>
        ))}
      </div>

      {/* Grafik (SVG, warna KCIC) — hanya di Beranda, mengikuti filter yang sama. */}
      <section aria-label="Grafik dashboard" className="space-y-3">
        <div className="card">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">Kehadiran harian</h2>
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span className="flex items-center gap-1">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded" style={{ backgroundColor: '#8b1a1a' }} />
                Hadir
              </span>
              <span className="flex items-center gap-1">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded" style={{ backgroundColor: '#d97706' }} />
                Terlambat
              </span>
            </div>
          </div>
          {series.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Belum ada data pada rentang ini.</p>
          ) : (
            <AttendanceBarChart series={series} />
          )}
          <p className="mt-1 text-xs text-slate-500">
            Menampilkan maksimal 31 hari terakhir dalam rentang {range.from || '-'} s.d. {range.to || '-'}.
          </p>
        </div>
        <div className="card">
          <h2 className="mb-2 text-sm font-bold text-slate-900">Distribusi hari kerja</h2>
          {hasData ? (
            <DistributionDonut onTime={onTime} late={lateCount} needsReview={num('needsReview') ?? 0} absent={absent} />
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">Belum ada data pada rentang ini.</p>
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {canMonitoring ? <Link to="/monitoring" className="btn-primary">Monitoring</Link> : null}
        {canApproval ? <Link to="/approval" className="btn-secondary">Approval</Link> : null}
        {canReports ? <Link to="/reports" className="btn-secondary">Laporan</Link> : null}
        {canMaster ? <Link to="/master" className="btn-secondary">Data Master</Link> : null}
        {has('access:roles:manage') ? <Link to="/access" className="btn-secondary">Pengguna & Hak Akses</Link> : null}
        {has('admin:audit:view') ? <Link to="/audit" className="btn-secondary">Audit</Link> : null}
      </div>
    </div>
  );
}
