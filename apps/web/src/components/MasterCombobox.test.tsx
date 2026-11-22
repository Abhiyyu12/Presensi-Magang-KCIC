// @vitest-environment jsdom
// Fase 0.5: perilaku dasar MasterCombobox — pencarian di dalam dropdown,
// empty state, pilih via keyboard, dan debounce pencarian server-side.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MasterCombobox, type ComboboxOption } from './MasterCombobox';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const OPTIONS: ComboboxOption[] = [
  { value: 'u1', label: 'Biro Operasi', description: 'BIO-OPS' },
  { value: 'u2', label: 'Biro Teknik', description: 'BIO-TEK' },
  { value: 'u3', label: 'Divisi A', description: 'DIV-A' },
  { value: 'u4', label: 'Divisi B', description: 'DIV-B' },
  { value: 'u5', label: 'Divisi C', description: 'DIV-C' },
  { value: 'u6', label: 'Divisi D', description: 'DIV-D' },
  { value: 'u7', label: 'Divisi E', description: 'DIV-E' },
];

function typeValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('input value setter unavailable');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function Harness(props: {
  options: ComboboxOption[];
  serverSearch?: boolean;
  onFetch?: (term: string) => void;
}): ReactElement {
  const [picked, setPicked] = useState<string>('');
  return (
    <>
      <p data-testid="picked">{picked}</p>
      <MasterCombobox
        id="cb"
        label="Biro"
        value=""
        onChange={(_v, label) => setPicked(label)}
        fetchOptions={(term) => {
          props.onFetch?.(term);
          return Promise.resolve(props.options);
        }}
        serverSearch={props.serverSearch}
      />
    </>
  );
}

function mount(ui: ReactElement): { container: HTMLDivElement; root: ReturnType<typeof createRoot> } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(container);
  act(() => {
    root.render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  });
  return { container, root };
}

async function flushUntil(check: () => boolean, maxTicks = 20): Promise<void> {
  for (let i = 0; i < maxTicks && !check(); i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function openPanel(container: HTMLDivElement): Promise<HTMLInputElement> {
  const trigger = container.querySelector('#cb') as HTMLButtonElement;
  act(() => {
    trigger.click();
  });
  // Biarkan useQuery menyelesaikan fetch sebelum asersi.
  await flushUntil(() => container.querySelector('[role="option"]') !== null);
  return container.querySelector('input[role="combobox"]') as HTMLInputElement;
}

function optionsOf(container: HTMLDivElement): string[] {
  return Array.from(container.querySelectorAll('[role="option"]')).map((el) => el.textContent ?? '');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('MasterCombobox', () => {
  it('menampilkan semua opsi saat dibuka dan empty state saat pencarian tidak cocok', async () => {
    const { container, root } = mount(<Harness options={OPTIONS} serverSearch={false} />);
    const search = await openPanel(container);
    expect(container.querySelectorAll('[role="option"]').length).toBe(OPTIONS.length);

    act(() => {
      typeValue(search, 'zzz');
    });
    expect(container.textContent).toContain('Data tidak dimukan');

    act(() => {
      typeValue(search, 'Biro');
    });
    expect(optionsOf(container)).toEqual(['Biro OperasiBIO-OPS', 'Biro TeknikBIO-TEK']);
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('memilih opsi lewat keyboard (ArrowDown + Enter) dan menutup panel', async () => {
    const { container, root } = mount(<Harness options={OPTIONS} />);
    const search = await openPanel(container);
    act(() => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    });
    act(() => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect((container.querySelector('[data-testid="picked"]') as HTMLElement).textContent).toBe('Biro Teknik');
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('pencarian server-side diteruskan ke fetcher setelah debounce', async () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const { container, root } = mount(
      <Harness options={OPTIONS} serverSearch onFetch={(term) => seen.push(term)} />,
    );
    const trigger = container.querySelector('#cb') as HTMLButtonElement;
    act(() => {
      trigger.click();
    });
    expect(seen).toEqual(['']);

    const search = container.querySelector('input[role="combobox"]') as HTMLInputElement;
    act(() => {
      typeValue(search, 'tek');
    });
    expect(seen).toEqual(['']);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(seen).toEqual(['', 'tek']);
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
