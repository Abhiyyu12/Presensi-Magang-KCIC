import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Tabs } from '../components/Tabs';
import { MASTER_RESOURCES } from './master/config';
import { ResourcePanel } from './master/ResourcePanel';
import { UsersPanel } from './master/UsersPanel';
import { SchedulesPanel } from './master/SchedulesPanel';
import { RolesPanel } from './master/RolesPanel';
import { ParametersPanel } from './master/ParametersPanel';

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
        <h1 className="text-lg font-bold text-stone-900">Data Master</h1>
        <p className="text-sm text-stone-600">
          Kelola data master operasional. Perubahan tervalidasi server dan tercatat pada audit.
          Penghapusan hanya bisa bila data belum pernah dipakai; jika sudah dipakai, gunakan
          penonaktifan dan tanggal efektif.
        </p>
      </header>

      <Tabs
        tabs={tabs.map((key) => ({ key, label: tabLabel(key) }))}
        active={activeTab}
        onChange={(key) => setTab(key)}
        ariaLabel="Kategori data master"
        tabId={(key) => `tab-${key}`}
        panelId={(key) => `tabpanel-${key}`}
        indicatorId="master-tabs-indicator"
      />

      <div
        key={activeTab}
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="tab-enter pt-1"
      >
        {activeTab === 'users' ? (
          <UsersPanel />
        ) : activeTab === 'roles' ? (
          <RolesPanel />
        ) : activeTab === 'schedules' ? (
          <SchedulesPanel />
        ) : activeTab === 'business-parameters' ? (
          <ParametersPanel path="/admin/business-parameters" label="Parameter" />
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
