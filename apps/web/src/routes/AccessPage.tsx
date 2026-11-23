import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Tabs } from '../components/Tabs';
import { RolesPermissionsPanel } from './access/RolesPermissionsPanel';
import { FeatureTreePanel } from './access/FeatureTreePanel';
import { PoliciesPanel } from './access/PoliciesPanel';
import { SimulatePanel } from './access/SimulatePanel';

type Tab = 'roles' | 'tree' | 'policies' | 'simulate';

const TABS: { key: Tab; label: string; anyOf: string[] }[] = [
  { key: 'roles', label: 'Role & Permission', anyOf: ['access:roles:manage', 'access:permissions:view'] },
  { key: 'tree', label: 'Feature Tree', anyOf: ['access:feature-tree:manage'] },
  { key: 'policies', label: 'ABAC/ReBAC', anyOf: ['access:policies:manage'] },
  { key: 'simulate', label: 'Simulasi', anyOf: ['access:simulate'] },
];

export default function AccessPage() {
  const { has } = useAuth();
  const [tab, setTab] = useState<Tab>('roles');
  const visibleTabs = TABS.filter((t) => t.anyOf.some((p) => has(p)));
  const activeTab = visibleTabs.some((t) => t.key === tab)
    ? tab
    : (visibleTabs[0]?.key ?? 'roles');
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-stone-900">Pengguna &amp; Hak Akses</h1>
        <p className="text-sm text-stone-600">
          Atur role, pohon permission, policy, dan simulasi akses. Semua perubahan diaudit server.
        </p>
      </header>
      <Tabs
        tabs={visibleTabs.map((t) => ({ key: t.key, label: t.label }))}
        active={activeTab}
        onChange={(key) => setTab(key as Tab)}
        ariaLabel="Bagian manajemen akses"
        tabId={(key) => `access-tab-${key}`}
        panelId={(key) => `access-panel-${key}`}
        indicatorId="access-tabs-indicator"
      />
      <div
        key={activeTab}
        role="tabpanel"
        id={`access-panel-${activeTab}`}
        aria-labelledby={`access-tab-${activeTab}`}
        className="tab-enter"
      >
        {activeTab === 'roles' ? <RolesPermissionsPanel /> : null}
        {activeTab === 'tree' ? <FeatureTreePanel /> : null}
        {activeTab === 'policies' ? <PoliciesPanel /> : null}
        {activeTab === 'simulate' ? <SimulatePanel /> : null}
      </div>
    </div>
  );
}
