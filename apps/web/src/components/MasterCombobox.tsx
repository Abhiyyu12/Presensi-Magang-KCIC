import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  /** Data tambahan dari baris sumber (mis. tanggal periode magang) untuk autofill form. */
  meta?: Record<string, unknown>;
}

interface MasterComboboxProps {
  id: string;
  label: string;
  value: string;
  /** Teks tampilan untuk nilai terpilih (mis. nama relasi dari baris yang diedit). */
  valueLabel?: string;
  onChange: (value: string, label: string, meta?: Record<string, unknown>) => void;
  fetchOptions: (search: string) => Promise<ComboboxOption[]>;
  /** true: pencarian dikirim ke server dengan debounce; false: filter di sisi klien. */
  serverSearch?: boolean;
  /** Nilai dependensi; null berarti dependensi belum dipilih (tampilkan depHint). */
  queryExtra?: string | null;
  depHint?: string;
  required?: boolean;
  error?: string | null;
  disabled?: boolean;
  placeholder?: string;
  allowClear?: boolean;
}

const EMPTY_TEXT = 'Data tidak dimukan';
const LOAD_TEXT = 'Memuat…';
const MAX_VISIBLE_HEIGHT = '12.5rem'; // tepat 5 baris (5 x 2.5rem), sisanya scroll di dalam

export function MasterCombobox({
  id,
  label,
  value,
  valueLabel,
  onChange,
  fetchOptions,
  serverSearch = true,
  queryExtra,
  depHint,
  required = false,
  error,
  disabled = false,
  placeholder = 'Pilih…',
  allowClear = false,
}: MasterComboboxProps) {
  const instanceId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const fetchRef = useRef(fetchOptions);
  fetchRef.current = fetchOptions;

  const listId = `${id}-listbox`;
  const optionId = (index: number) => `${id}-opt-${index}`;

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setDebounced('');
    setActiveIndex(0);
  }, [open]);

  // Server-side search dengan debounce 300ms agar tidak menembak API per ketikan.
  useEffect(() => {
    if (!serverSearch || !open) return;
    const timer = window.setTimeout(() => setDebounced(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search, serverSearch, open]);

  // Tutup saat klik di luar komponen.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const term = serverSearch ? debounced : '';
  const optionsQuery = useQuery({
    queryKey: ['combobox', instanceId, queryExtra ?? '', term],
    queryFn: () => fetchRef.current(term),
    enabled: open && queryExtra !== null,
    staleTime: 30_000,
  });

  const options = useMemo(() => {
    const items = optionsQuery.data ?? [];
    if (serverSearch) return items;
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.description ?? '').toLowerCase().includes(q),
    );
  }, [optionsQuery.data, serverSearch, search]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open, options]);

  const pick = (option: ComboboxOption) => {
    onChange(option.value, option.label, option.meta);
    setOpen(false);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      // stopPropagation agar dialog di belakang (ConfirmDialog) tidak ikut tertutup.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(options.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) pick(option);
    }
  };

  const display = valueLabel || value || placeholder;
  const hasValue = value !== '';

  return (
    <div ref={containerRef} className="relative">
      <label className="label" htmlFor={id}>
        {label}
        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
      </label>
      <div className="flex items-center gap-1">
        <button
          type="button"
          id={id}
          className={`input flex min-h-touch w-full min-w-0 items-center justify-between text-left ${
            error ? 'border-red-400' : ''
          }`}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`truncate ${hasValue ? 'text-slate-900' : 'text-slate-400'}`}>{display}</span>
          <span aria-hidden="true" className="ml-2 shrink-0 text-slate-400">▾</span>
        </button>
        {allowClear && hasValue && !disabled ? (
          <button
            type="button"
            className="btn-secondary shrink-0 px-2"
            aria-label="Hapus pilihan"
            onClick={() => onChange('', '')}
          >
            ✕
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1 text-xs font-medium text-red-600" role="alert">{error}</p>
      ) : null}

      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <input
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={options[activeIndex] ? optionId(activeIndex) : undefined}
              aria-autocomplete="list"
              aria-label={`Cari ${label}`}
              className="input px-2 py-1.5 text-sm"
              placeholder="Cari…"
              autoFocus
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-label={label} className="overflow-y-auto py-1" style={{ maxHeight: MAX_VISIBLE_HEIGHT }}>
            {queryExtra === null ? (
              <li className="px-3 py-2 text-sm text-slate-500">{depHint ?? 'Pilih nilai terkait terlebih dahulu.'}</li>
            ) : optionsQuery.isLoading ? (
              <li className="px-3 py-2 text-sm text-slate-500">{LOAD_TEXT}</li>
            ) : optionsQuery.isError ? (
              <li className="px-3 py-2 text-sm text-red-600">Gagal memuat data.</li>
            ) : options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">{EMPTY_TEXT}</li>
            ) : (
              options.map((option, index) => (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={option.value === value}
                  className={`flex h-10 cursor-pointer items-center gap-2 px-3 text-sm ${
                    index === activeIndex ? 'bg-brand-50' : ''
                  } ${option.value === value ? 'font-semibold text-brand-800' : 'text-slate-700'}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="truncate">{option.label}</span>
                  {option.description ? (
                    <span className="ml-auto shrink-0 text-xs text-slate-500">{option.description}</span>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
