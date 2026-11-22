import { useState } from 'react';
import { RolesPermissionsPanel } from './access/RolesPermissionsPanel';
import { FeatureTreePanel } from './access/FeatureTreePanel';
import { PoliciesPanel } from './access/PoliciesPanel';
import { SimulatePanel } from './access/SimulatePanel';

type Tab = 'roles' | 'tree' | 'policies' | 'simulate';

const TABS: { key: Tab; label: string }[] = [
  { key: 'roles', label: 'Role & Permission' },
  { key: 'tree', label: 'Feature Tree' },
  { key: 'policies', label: 'ABAC/ReBAC' },
  { key: 'simulate', label: 'Simulasi' },
];

export default function AccessPage() {
  const [tab, setTab] = useState<Tab>('roles');
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Manajemen Akses</h1>
        <p className="text-sm text-slate-600">
          Konfigurasi role, permission, feature tree, dan policy. Semua perubahan diaudit server.
        </p>
      </header>
      <div role="tablist" aria-label="Bagian manajemen akses" className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((item) => (
          <button
            key={item.key}
            role="tab"
            type="button"
            id={`access-tab-${item.key}`}
            aria-selected={tab === item.key}
            aria-controls={`access-panel-${item.key}`}
            className={`min-h-touch shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              tab === item.key
                ? 'border-brand-700 text-brand-800'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`access-panel-${tab}`} aria-labelledby={`access-tab-${tab}`}>
        {tab === 'roles' ? <RolesPermissionsPanel /> : null}
        {tab === 'tree' ? <FeatureTreePanel /> : null}
        {tab === 'policies' ? <PoliciesPanel /> : null}
        {tab === 'simulate' ? <SimulatePanel /> : null}
      </div>
    </div>
  );
}
