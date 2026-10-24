import { useEffect, useRef } from 'react';

export const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
};

const KEYS: [string, string][] = [
  ['J or Down', 'Next complaint in the queue'],
  ['K or Up', 'Previous complaint'],
  ['Enter', 'Open the complaint'],
  ['C', 'Confirm the model suggestion'],
  ['R', 'Correct the triage'],
  ['Escape', 'Close a tooltip or form, then back to the queue'],
  ['?', 'Show these shortcuts'],
];

// Native dialog: it traps focus, closes on Escape and returns focus to where it was.
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="keys" aria-labelledby="keys-h" onClose={onClose}>
      <h2 id="keys-h">Keyboard shortcuts</h2>
      <dl>
        {KEYS.map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>{k.split(' or ').map((x, i) => <span key={x}>{i > 0 && ' or '}<kbd className="kbd">{x}</kbd></span>)}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="btn close" onClick={onClose}>Close</button>
    </dialog>
  );
}

export function useShortcutsKey(setOpen: (v: boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '?' && !isTyping(e) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
}
