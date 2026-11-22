import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { MASTER_RESOURCES } from './master/config';
import { ResourcePanel } from './master/ResourcePanel';
import { UsersPanel } from './master/UsersPanel';
import { SchedulesPanel } from './master/SchedulesPanel';
import { RolesPanel } from './master/RolesPanel';

type TabKey = 'users' | 'schedules' | string;

const TAB_ORDER: TabKey[] = [
  'users',
  'roles',
  'bureaus',
  'divisions',
  'placements',
  'schedules',
  'calendar',
  'leave-categories',
  'business-parameters',
  'scopes',
];

const TAB_PERMISSIONS: Record<string, string> = {
  users: 'admin:users:manage',
  roles: 'access:roles:manage',
  bureaus: 'admin:org:manage',
  divisions: 'admin:org:manage',
  placements: 'admin:placements:manage',
  schedules: 'admin:schedules:manage',
  calendar: 'admin:calendar:manage',
  'leave-categories': 'admin:leave-categories:manage',
  'business-parameters': 'admin:params:manage',
  scopes: 'access:scopes:manage',
};

function tabLabel(key: TabKey): string {
  if (key === 'users') return 'Pengguna';
  if (key === 'roles') return 'Role';
  if (key === 'schedules') return 'Jadwal';
  return MASTER_RESOURCES.find((r) => r.key === key)?.label ?? key;
}

export default function MasterDataPage() {
  const [tab, setTab] = useState<TabKey>('users');
  const { has } = useAuth();
  // Tab disembunyikan bila permission panel-nya tidak ada (langkah awal menu dinamis).
  const tabs = TAB_ORDER.filter((key) => {
    const perm = TAB_PERMISSIONS[key];
    return !perm || has(perm);
  });
  const activeTab = tabs.includes(tab) ? tab : (tabs[0] ?? 'users');

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
        {tabs.map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            id={`tab-${key}`}
            aria-selected={activeTab === key}
            aria-controls={`tabpanel-${key}`}
            className={`min-h-touch shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === key
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
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="pt-1"
      >
        {activeTab === 'users' ? (
          <UsersPanel />
        ) : activeTab === 'roles' ? (
          <RolesPanel />
        ) : activeTab === 'schedules' ? (
          <SchedulesPanel />
        ) : (
          (() => {
            const config = MASTER_RESOURCES.find((r) => r.key === activeTab);
            return config ? <ResourcePanel key={config.key} config={config} /> : null;
          })()
        )}
      </div>
    </div>
  );
}
