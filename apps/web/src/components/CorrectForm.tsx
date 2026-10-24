import { useEffect, useRef, useState } from 'react';
import {
  computeDeadline, LIMIT_ARTICLE, OUTCOME_LABEL, OUTCOME_LIMIT, SERIOUS_OUTCOMES,
  type ComplaintDetail, type HumanTriage, type ModelTriage, type SeriousOutcome,
} from '@playnt/shared';
import { api, RequestError } from '../api';
import { Icon } from './Icon';
import { fmtDay } from './Status';
import { Term } from './Term';

type Errors = Partial<Record<'isComplaint' | 'outcome' | 'problem' | 'quote' | 'reason' | 'form', string>>;

function YesNo({ name, legend, value, onChange, children }: { name: string; legend: React.ReactNode; value: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <span className="seg">
        {[true, false].map((v) => (
          <label key={String(v)}><input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />{v ? 'Yes' : 'No'}</label>
        ))}
      </span>
      {children}
    </fieldset>
  );
}

export function CorrectForm({ c, initial, onCancel, onSaved }: {
  c: ComplaintDetail;
  initial: HumanTriage | ModelTriage | null;
  onCancel: () => void;
  onSaved: (d: ComplaintDetail) => void;
}) {
  const [isComplaint, setIsComplaint] = useState(initial?.isComplaint ?? true);
  const [outcome, setOutcome] = useState<SeriousOutcome>(initial?.seriousOutcome ?? 'none');
  const [problem, setProblem] = useState(initial?.problemDescription ?? '');
  const [quote, setQuote] = useState(initial?.evidenceQuote ?? '');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const first = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const manual = c.status === 'needs_manual_triage';

  useEffect(() => { first.current?.querySelector('input')?.focus(); }, []);
  useEffect(() => { if (!isComplaint) setOutcome('none'); }, [isComplaint]);

  const serious = outcome !== 'none';
  const limit = OUTCOME_LIMIT[outcome];
  let due: string | null;
  try { due = limit ? computeDeadline(c.awarenessDate, limit).dueDate : null; } catch { due = null; }

  function check(): Errors {
    const e: Errors = {};
    if (!problem.trim()) e.problem = 'Describe the device problem in a few words.';
    if (quote.trim() && !c.text.includes(quote.trim())) e.quote = 'Copy the passage exactly from the complaint, or leave it empty.';
    if (reason.trim().length < 10) e.reason = manual ? 'Enter a note of at least 10 characters. It is stored in the audit trail.' : 'Enter a reason of at least 10 characters. It is stored in the audit trail.';
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = check();
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => (form.current?.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus());
      return;
    }
    const triage: HumanTriage = {
      isComplaint,
      possibleSeriousIncident: serious,
      seriousOutcome: outcome,
      timeLimitDays: limit,
      problemDescription: problem.trim(),
      evidenceQuote: quote.trim() || null,
      rationale: reason.trim().slice(0, 400),
    };
    setSaving(true);
    try {
      onSaved(await api.decide(c.id, { action: 'correct', triage, reason: reason.trim() }));
    } catch (err) {
      const body = err instanceof RequestError ? err.body : { error: String(err) };
      const map: Record<string, keyof Errors> = { 'triage.problemDescription': 'problem', 'triage.evidenceQuote': 'quote', reason: 'reason', 'triage.seriousOutcome': 'outcome', 'triage.isComplaint': 'isComplaint' };
      const next: Errors = { form: `Not saved. ${body.error}` };
      for (const i of body.issues ?? []) { const k = map[i.path]; if (k) next[k] = i.message; }
      setErrors(next);
    } finally {
      setSaving(false);
    }
  }

  const err = (k: keyof Errors) => errors[k] && <div className="errmsg" id={`e-${k}`}><Icon name="manual" />{errors[k]}</div>;

  return (
    <form className="stackform pbody" style={{ borderTop: '1px solid var(--line)' }} onSubmit={submit} ref={form} noValidate aria-labelledby="corr-h">
      <div id="corr-h" style={{ fontWeight: 700 }}>{manual ? 'Triage by hand' : 'Correct the triage'}</div>
      <div ref={first}>
        <YesNo name="isComplaint" legend={<>Is this a <Term k="complaint">complaint</Term>?</>} value={isComplaint} onChange={setIsComplaint} />
      </div>
      <div>
        <label className="lbl" htmlFor="outcome">Serious outcome</label>
        <select id="outcome" className="select wide" value={outcome} onChange={(e) => setOutcome(e.target.value as SeriousOutcome)} aria-describedby="outcome-hint">
          {SERIOUS_OUTCOMES.filter((o) => isComplaint || o === 'none').map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
        </select>
        <div className="hint" id="outcome-hint" aria-live="polite">
          {limit ? `Possible serious incident. Sets the limit to ${limit} days, ${LIMIT_ARTICLE[limit]}${due ? `. Due ${fmtDay(due)}.` : '.'}` : 'Not a possible serious incident. No reporting limit.'}
        </div>
      </div>
      <div>
        <label className="lbl" htmlFor="problem">Device problem</label>
        <input id="problem" className="input wide" value={problem} onChange={(e) => setProblem(e.target.value)} maxLength={200} aria-invalid={!!errors.problem} aria-describedby={errors.problem ? 'e-problem' : undefined} />
        {err('problem')}
      </div>
      <div>
        <label className="lbl" htmlFor="quote">Supporting passage <span className="meta">(optional)</span></label>
        <input id="quote" className="input wide" value={quote} onChange={(e) => setQuote(e.target.value)} maxLength={400} aria-invalid={!!errors.quote} aria-describedby={errors.quote ? 'e-quote' : 'quote-hint'} />
        {err('quote') || <div className="hint" id="quote-hint">Copied exactly from the complaint. It is highlighted in the text.</div>}
      </div>
      <div>
        <label className="lbl" htmlFor="reason">{manual ? 'Note for the audit trail' : 'Reason for correction'}</label>
        <textarea id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} aria-invalid={!!errors.reason} aria-describedby={errors.reason ? 'e-reason' : 'reason-hint'} />
        {err('reason') || <div className="hint" id="reason-hint">Required. Say which rule applies and why, for example the risk file or MDCG 2023-3.</div>}
      </div>
      {errors.form && <div className="alert" role="alert">{errors.form}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving' : manual ? 'Save triage' : 'Save correction'}</button>
        <button type="button" className="btn quiet" onClick={onCancel}>Cancel<kbd className="kbd" aria-hidden="true">Esc</kbd></button>
      </div>
    </form>
  );
}
