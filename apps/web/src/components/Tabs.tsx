import { motion } from 'motion/react';
import { SPRING } from '../lib/motion';

export interface TabDef {
  key: string;
  label: string;
}

interface TabsProps {
  tabs: TabDef[];
  active: string;
  onChange: (key: string) => void;
  ariaLabel: string;
  tabId: (key: string) => string;
  panelId: (key: string) => string;
  indicatorId: string;
}

// Tab gaya "penanda rel": rail garis bawah, tick kecil pada tab non-aktif,
// dan indikator merah yang bergeser (layoutId) mengikuti tab aktif.
export function Tabs({ tabs, active, onChange, ariaLabel, tabId, panelId, indicatorId }: TabsProps) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 overflow-x-auto border-b border-stone-200">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            id={tabId(t.key)}
            aria-selected={isActive}
            aria-controls={panelId(t.key)}
            className={`relative min-h-touch shrink-0 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors duration-150 ${
              isActive ? 'text-brand-800' : 'text-stone-600 hover:text-stone-900'
            }`}
            onClick={() => onChange(t.key)}
          >
            {t.label}
            <span
              aria-hidden="true"
              className={`absolute bottom-0 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full ${
                isActive ? 'bg-transparent' : 'bg-stone-300'
              }`}
            />
            {isActive ? (
              <motion.span
                layoutId={indicatorId}
                transition={SPRING}
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand-700"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
