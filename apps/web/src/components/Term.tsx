import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { GLOSSARY, SOURCES, type GlossaryKey } from '@playnt/shared';

// One tooltip for every regulatory term. Opens on hover, keyboard focus and tap; Escape closes it.
// The text is always in the DOM and linked with aria-describedby, so screen readers announce it on focus.
export function Tip({ label, children, className, up = false }: { label: ReactNode; children: ReactNode; className?: string; up?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setPinned(false); } };
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) { setOpen(false); setPinned(false); } };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open]);

  return (
    <span
      className="term-wrap"
      ref={wrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!pinned) setOpen(false); }}
    >
      <button
        type="button"
        className={className ?? 'term'}
        aria-describedby={id}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={(e) => { if (!pinned && !wrap.current?.contains(e.relatedTarget as Node)) setOpen(false); }}
        onClick={() => { setPinned((p) => !p); setOpen(true); }}
      >
        {label}
      </button>
      <span role="tooltip" id={id} className={`tip${up ? ' up' : ''}`} hidden={!open}>
        {children}
      </span>
    </span>
  );
}

export function Term({ k, children, up }: { k: GlossaryKey; children?: ReactNode; up?: boolean }) {
  const g = GLOSSARY[k];
  const s = SOURCES[g.source];
  return (
    <Tip label={children ?? g.term} up={up}>
      <b>{g.term}</b>
      {g.definition}
      <span className="cite">
        {g.cite}. <a href={s.url} target="_blank" rel="noreferrer">{s.label}</a>
      </span>
      <span className="cite">Press Escape to close</span>
    </Tip>
  );
}
