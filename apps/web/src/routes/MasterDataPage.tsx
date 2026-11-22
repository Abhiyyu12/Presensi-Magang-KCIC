import { useState } from 'react';
import { MASTER_RESOURCES } from './master/config';
import { ResourcePanel } from './master/ResourcePanel';
import { UsersPanel } from './master/UsersPanel';
import { SchedulesPanel } from './master/SchedulesPanel';

type TabKey = 'users' | 'schedules' | string;

const TAB_ORDER: TabKey[] = [
  'users',
  'intern-profiles',
  'bureaus',
  'divisions',
  'placements',
  'assignments',
  'schedules',
  'calendar',
  'leave-categories',
  'business-parameters',
  'scopes',
];

function tabLabel(key: TabKey): string {
  if (key === 'users') return 'Pengguna';
  if (key === 'schedules') return 'Jadwal';
  return MASTER_RESOURCES.find((r) => r.key === key)?.label ?? key;
}

export default function MasterDataPage() {
  const [tab, setTab] = useState<TabKey>('users');

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Data Master</h1>
        <p className="text-sm text-slate-600">
          Kelola data master operasional. Perubahan tervalidasi server dan tercatat pada audit;
          tidak ada penghapusan — gunakan penonaktifan dan tanggal efektif.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Kategori data master"
        className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-px"
      >
        {TAB_ORDER.map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            id={`tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`tabpanel-${key}`}
            className={`min-h-touch shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              tab === key
                ? 'border-brand-700 text-brand-800'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setTab(key)}
          >
            {tabLabel(key)}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`tabpanel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="pt-1"
      >
        {tab === 'users' ? (
          <UsersPanel />
        ) : tab === 'schedules' ? (
          <SchedulesPanel />
        ) : (
          (() => {
            const config = MASTER_RESOURCES.find((r) => r.key === tab);
            return config ? <ResourcePanel key={config.key} config={config} /> : null;
          })()
        )}
      </div>
    </div>
  );
}
