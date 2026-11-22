// @vitest-environment jsdom
// Regression: ConfirmDialog must not steal focus on parent re-renders.
// Bug: the focus-trap effect re-ran on every keystroke (unstable onClose dep),
// so typing one character into the SECOND field jumped focus to the FIRST field
// and the rest of the string landed in the wrong input.
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { ConfirmDialog } from './ConfirmDialog';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

function typeChar(input: HTMLInputElement, char: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('input value setter unavailable');
  setter.call(input, input.value + char);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ConfirmDialog focus behavior', () => {
  it('keeps focus on the field being typed while the parent re-renders', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    function Parent(): JSX.Element {
      const [values, setValues] = useState<Record<string, string>>({ a: '', b: '' });
      return (
        <ConfirmDialog open title="Uji fokus" onConfirm={() => undefined} onClose={() => undefined}>
          <input id="first" value={values.a} onChange={(e) => setValues((v) => ({ ...v, a: e.target.value }))} />
          <input id="second" value={values.b} onChange={(e) => setValues((v) => ({ ...v, b: e.target.value }))} />
        </ConfirmDialog>
      );
    }
    act(() => {
      root.render(<Parent />);
    });
    const first = container.querySelector('#first') as HTMLInputElement;
    const second = container.querySelector('#second') as HTMLInputElement;
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    act(() => {
      second.focus();
    });
    for (const ch of 'abcdefgh') {
      act(() => {
        typeChar(second, ch);
      });
    }
    expect(document.activeElement).toBe(second);
    expect(second.value).toBe('abcdefgh');
    expect(first.value).toBe('');
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('restores focus to the opener when the dialog closes', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    function Parent(): JSX.Element {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" id="opener" onClick={() => setOpen(true)}>
            Buka
          </button>
          <ConfirmDialog open={open} title="Uji tutup" onConfirm={() => undefined} onClose={() => setOpen(false)}>
            <input id="dlg" defaultValue="" />
          </ConfirmDialog>
        </>
      );
    }
    act(() => {
      root.render(<Parent />);
    });
    const opener = container.querySelector('#opener') as HTMLButtonElement;
    act(() => {
      opener.focus();
    });
    expect(document.activeElement).toBe(opener);
    act(() => {
      opener.click();
    });
    const dlg = container.querySelector('#dlg') as HTMLInputElement;
    expect(dlg).not.toBeNull();
    expect(document.activeElement).toBe(dlg);
    act(() => {
      container.querySelector<HTMLButtonElement>('button[aria-label], .btn-secondary')?.click();
    });
    expect(document.activeElement).toBe(opener);
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
