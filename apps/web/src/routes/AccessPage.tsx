import { useState } from 'react';
import { useAuth } from '../lib/auth';
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
      <div role="tablist" aria-label="Bagian manajemen akses" className="flex gap-1 overflow-x-auto border-b border-stone-200">
        {visibleTabs.map((item) => (
          <button
            key={item.key}
            role="tab"
            type="button"
            id={`access-tab-${item.key}`}
            aria-selected={activeTab === item.key}
            aria-controls={`access-panel-${item.key}`}
            className={`min-h-touch shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === item.key
                ? 'border-brand-700 text-brand-800'
                : 'border-transparent text-stone-600 hover:text-stone-900'
            }`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`access-panel-${activeTab}`} aria-labelledby={`access-tab-${activeTab}`}>
        {activeTab === 'roles' ? <RolesPermissionsPanel /> : null}
        {activeTab === 'tree' ? <FeatureTreePanel /> : null}
        {activeTab === 'policies' ? <PoliciesPanel /> : null}
        {activeTab === 'simulate' ? <SimulatePanel /> : null}
      </div>
    </div>
  );
}
