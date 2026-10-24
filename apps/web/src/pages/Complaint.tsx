import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  LIMIT_ARTICLE, OUTCOME_LABEL, timeLeft, viennaDate,
  type ComplaintDetail, type ComplaintSummary, type HumanDecisionEntry, type ModelSuggestionEntry,
} from '@playnt/shared';
import { api, RequestError } from '../api';
import { CorrectForm } from '../components/CorrectForm';
import { Icon } from '../components/Icon';
import { isTyping } from '../components/Shortcuts';
import { Flag, fmtDay, TriageStatus } from '../components/Status';
import { Term } from '../components/Term';
import { useHealth, useLoad, useTitle } from '../hooks';
import { isWaiting } from './Queue';
import { NotFound } from './NotFound';

const LIMIT_TERM = { 2: 'limit2', 10: 'limit10', 15: 'limit15' } as const;

function Highlight({ text, quote }: { text: string; quote: string | null }) {
  const i = quote ? text.indexOf(quote) : -1;
  if (!quote || i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark>{quote}</mark>{text.slice(i + quote.length)}</>;
}

// Built from parts: browsers disagree on the comma after the weekday.
const longDate = (day: string) => {
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).formatToParts(new Date(`${day}T00:00:00Z`));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')} ${get('year')}`;
};
const stamp = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Vienna', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '');

function ReportControl({ c, now, onSaved }: { c: ComplaintDetail; now: string; onSaved: (d: ComplaintDetail) => void }) {
  const [on, setOn] = useState(viennaDate(now));
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr(null);
    try { onSaved(await api.report(c.id, on)); }
    catch (x) { setErr(x instanceof RequestError ? (x.body.issues?.[0]?.message ?? x.message) : String(x)); }
    finally { setSaving(false); }
  }
  return (
    <form className="foot" onSubmit={save} noValidate style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div>
        <label className="lbl" htmlFor="reported">Report submitted on</label>
        <input id="reported" type="date" className="input" value={on} max={viennaDate(now)} min={c.awarenessDate} onChange={(e) => setOn(e.target.value)} aria-invalid={!!err} aria-describedby={err ? 'rep-e' : 'rep-h'} />
      </div>
      <button type="submit" className="btn" disabled={saving}>{saving ? 'Recording' : 'Record report'}</button>
      <div style={{ flexBasis: '100%' }}>
        {err ? <div className="errmsg" id="rep-e"><Icon name="manual" />{err}</div> : <div className="hint" id="rep-h">Playnt does not send reports. Record the date your report reached the competent authority; it stops the clock and goes into the audit trail.</div>}
      </div>
    </form>
  );
}

function DeadlinePanel({ c, now, onReport }: { c: ComplaintDetail; now: string; onReport: (d: ComplaintDetail) => void }) {
  if (c.status === 'needs_manual_triage') {
    return <section className="panel" aria-labelledby="dl-h"><h2 className="panel-h" id="dl-h"><Icon name="clock" />Reporting deadline</h2>
      <div className="pbody"><p style={{ margin: 0 }}>Not set yet. Triage this complaint by hand to set the time limit. The clock already runs from the <Term k="awarenessDate">awareness date</Term>, {fmtDay(c.awarenessDate)}.</p></div></section>;
  }
  if (!c.limitDays) {
    return <section className="panel" aria-labelledby="dl-h"><h2 className="panel-h" id="dl-h"><Icon name="clock" />Reporting deadline</h2>
      <div className="pbody"><p style={{ margin: 0 }}>No reporting deadline: {c.isComplaint === false ? 'this is not a complaint' : <>not a possible <Term k="seriousIncident">serious incident</Term>. It counts towards <Term k="trendReporting">trends</Term></>}.</p></div></section>;
  }
  if (!c.deadline) {
    return <section className="panel"><h2 className="panel-h"><Icon name="clock" />Reporting deadline</h2><div className="pbody">The awareness date falls outside the 2026 to 2027 holiday calendar, so Playnt does not compute a deadline. Count it by hand.</div></section>;
  }
  const d = c.deadline;
  const l = timeLeft(d.dueAt, now);
  const late = c.reportedOn ? c.reportedOn > d.dueDate : false;
  const today = viennaDate(now);
  return (
    <section className="panel" aria-labelledby="dl-h">
      <h2 className="panel-h" id="dl-h"><Icon name="clock" />Reporting deadline<span className="r">{c.deadlineBasis === 'suggested' ? 'If the suggestion is confirmed' : 'Decided'}</span></h2>
      <div className="pbody">
        <div className="clock">
          {c.reportedOn
            ? <div className={`big${late ? ' over' : ''}`}>Reported<small> {fmtDay(c.reportedOn)}, {late ? 'after the deadline' : 'on time'}</small></div>
            : <div className={`big${l.overdue ? ' over' : l.soon ? ' soon' : ''}`}>{l.days} d {l.hours} h<small> {l.overdue ? 'overdue' : 'left'}</small></div>}
          <div>
            <div className="dueline">Due {longDate(d.dueDate)}, 23:59 Vienna</div>
            <div className="sub"><Term k={LIMIT_TERM[d.limitDays]}>{d.limitDays}-day limit</Term>, {LIMIT_ARTICLE[d.limitDays]}</div>
          </div>
        </div>
        <ol className="bigtrack" aria-label="Reporting period, day by day">
          {d.days.map((x) => {
            const cls = [x.date < today && 'past', x.date === today && 'today', x.rest && 'rest', x.extension && 'ext', x.date === d.dueDate && 'due'].filter(Boolean).join(' ');
            const label = x.index === 0 ? 'Day 0, aware' : x.date === d.dueDate ? 'Due 23:59' : x.rest ? x.rest : x.extension ? 'Working day' : `Day ${x.index}`;
            return <li key={x.date} className={cls} aria-current={x.date === today ? 'date' : undefined}><b>{fmtDay(x.date)}</b><span>{label}</span></li>;
          })}
        </ol>
        <ul className="why">{d.explanation.map((e) => <li key={e}>{e}</li>)}</ul>
        {c.deadlineBasis === 'decided' && !c.reportedOn && <ReportControl c={c} now={now} onSaved={onReport} />}
        <p className="note foot">
          <Term k="calendarDays">Calendar days</Term> and <Term k="publicHolidays">Austrian public holidays</Term>. Other Member States have other public holidays. If reportability is uncertain, report within the limit anyway (<Term k="uncertain">Art. 87(7)</Term>).
        </p>
      </div>
    </section>
  );
}

function SuggestionView({ s }: { s: ModelSuggestionEntry }) {
  const t = s.triage;
  if (!t) {
    return (
      <div className="rejected" role="note">
        <strong>{s.raw === null ? 'The model could not be reached.' : 'The model output was rejected.'}</strong> {s.error}
        {s.raw !== null && <><div className="meta" style={{ marginTop: 8 }}>Raw output, stored unchanged:</div><pre>{s.raw || '(empty)'}</pre></>}
      </div>
    );
  }
  return (
    <>
      <dl className="fields">
        <div className="field"><dt><Term k="complaint">Complaint</Term></dt><dd>{t.isComplaint ? 'Yes' : 'No'}</dd></div>
        <div className="field"><dt>Possible <Term k="seriousIncident">serious incident</Term></dt><dd className={t.possibleSeriousIncident ? 'serious' : ''}>{t.possibleSeriousIncident ? 'Yes' : 'No'}</dd></div>
        <div className="field"><dt>Outcome</dt><dd>{OUTCOME_LABEL[t.seriousOutcome]}</dd></div>
        <div className="field"><dt>Time limit</dt><dd>{t.timeLimitDays ? `${t.timeLimitDays} days, ${LIMIT_ARTICLE[t.timeLimitDays]}` : 'None'}</dd></div>
        <div className="field"><dt>Problem</dt><dd>{t.problemDescription}</dd></div>
      </dl>
      <blockquote className="quote" style={{ marginInline: 0 }}>{t.evidenceQuote}</blockquote>
      <p className="rationale">{t.rationale}</p>
    </>
  );
}

export function ComplaintPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const health = useHealth();
  const [load, reload, set] = useLoad<ComplaintDetail>(() => api.complaint(id), [id]);
  const [correcting, setCorrecting] = useState(params.get('correct') === '1');
  const [busy, setBusy] = useState<'confirm' | 'retry' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [next, setNext] = useState<ComplaintSummary | null | undefined>(undefined);
  const nextRef = useRef<HTMLAnchorElement | HTMLParagraphElement | null>(null);
  const correctBtn = useRef<HTMLButtonElement>(null);
  const c = load.state === 'ready' ? load.data : null;
  useTitle(c ? c.ref : 'Complaint');

  useEffect(() => { setCorrecting(params.get('correct') === '1'); setNext(undefined); setError(null); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function afterDecision(d: ComplaintDetail) {
    set(d);
    setFresh(d.audit.at(-1)?.id ?? null);
    setCorrecting(false);
    if (params.has('correct')) { params.delete('correct'); setParams(params, { replace: true }); }
    const waiting = (await api.complaints(new URLSearchParams({ status: 'waiting' })).catch(() => [])).filter((x) => x.id !== d.id && isWaiting(x));
    setNext(waiting[0] ?? null);
    requestAnimationFrame(() => nextRef.current?.focus());
  }

  async function confirm() {
    if (!c || c.status !== 'suggested' || busy) return;
    setBusy('confirm'); setError(null);
    try { await afterDecision(await api.decide(c.id, { action: 'confirm' })); }
    catch (e) { setError(`Not confirmed. ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function retry() {
    if (!c || busy) return;
    setBusy('retry'); setError(null);
    try { const d = await api.retry(c.id); set(d); setFresh(d.audit.at(-1)?.id ?? null); }
    catch (e) { setError(`The model was not asked again. ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
      if (e.key === 'Escape') {
        if (correcting) { e.preventDefault(); setCorrecting(false); requestAnimationFrame(() => correctBtn.current?.focus()); return; }
        if (!isTyping(e)) { e.preventDefault(); navigate('/'); }
        return;
      }
      if (isTyping(e) || !c) return;
      if (e.key === 'c') { e.preventDefault(); void confirm(); }
      if (e.key === 'r') { e.preventDefault(); setCorrecting(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (load.state === 'error') {
    if (load.error.status === 404) return <NotFound what="complaint" detail={`There is no complaint with the ID ${id}. Check the link, or find the complaint in the queue.`} />;
    return <div className="alert" role="alert"><strong>The complaint could not be loaded.</strong> {load.error.message} <button type="button" className="btn" onClick={reload}>Try again</button></div>;
  }
  if (!c || !health) return <DetailSkeleton />;

  const suggestion = [...c.triageHistory].reverse().find((h): h is ModelSuggestionEntry => h.kind === 'model_suggestion')!;
  const decision = [...c.triageHistory].reverse().find((h): h is HumanDecisionEntry => h.kind === 'human_decision');
  const current = decision?.triage ?? suggestion.triage;
  const quote = current?.evidenceQuote ?? suggestion.triage?.evidenceQuote ?? null;
  const decidedLater = decision && decision.at > suggestion.at;

  return (
    <>
      <Link className="crumb" to="/"><Icon name="back" />Queue</Link>
      <div className="dhead">
        <h1>{c.ref}</h1>
        {c.possibleSeriousIncident && <Flag c={c} pill />}
        <TriageStatus status={c.status} long />
      </div>
      <p className="dsub">{c.deviceDetail.name}, class {c.deviceDetail.riskClass}. Received by {c.channel} from a {c.reporter.role.toLowerCase()}.</p>

      <div className="grid">
        <div className="stack">
          <DeadlinePanel c={c} now={health.now} onReport={(d) => { set(d); setFresh(d.audit.at(-1)?.id ?? null); }} />
          <section className="panel" aria-labelledby="c-h">
            <h2 className="panel-h" id="c-h">Complaint<span className="r">As received, not edited</span></h2>
            <div className="pbody">
              <p className="complaint-text"><Highlight text={c.text} quote={quote} /></p>
              <dl className="facts">
                <dt>Reporter</dt><dd>{c.reporter.role}, {c.reporter.country}</dd>
                <dt>Channel</dt><dd>{c.channel[0]!.toUpperCase() + c.channel.slice(1)}</dd>
                <dt>Received</dt><dd>{stamp(c.receivedAt)}</dd>
                <dt><Term k="awarenessDate">Awareness date</Term></dt><dd>{fmtDay(c.awarenessDate)} {c.awarenessDate.slice(0, 4)}</dd>
                <dt>Anticipated harms</dt><dd>{c.deviceDetail.anticipatedHarms.join('; ') || 'None listed'}</dd>
                <dt>Expected side-effects</dt><dd>{c.deviceDetail.expectedSideEffects.join('; ') || 'None listed'}</dd>
              </dl>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className={`panel sugg${decision ? ' decided' : ''}`} aria-labelledby="s-h">
            <h2 className="panel-h" id="s-h"><Icon name="suggested" />Model suggestion</h2>
            <div className="pbody">
              <div className="src">{suggestion.model}, prompt {suggestion.promptVersion}, {stamp(suggestion.at)}</div>
              <SuggestionView s={suggestion} />
            </div>
            {decision && decidedLater && (
              <div className="decision">
                <span className="what"><Icon name={decision.action === 'confirm' ? 'check' : 'pen'} />{decision.action === 'confirm' ? 'Confirmed' : 'Corrected'} by {decision.by}, {stamp(decision.at)}</span>
                {decision.action === 'correct' && <>
                  <span>Now: {decision.triage.possibleSeriousIncident ? `possible serious incident, ${OUTCOME_LABEL[decision.triage.seriousOutcome].toLowerCase()}, ${decision.triage.timeLimitDays} days` : decision.triage.isComplaint ? 'complaint, not a possible serious incident' : 'not a complaint'}.</span>
                  <span className="reason">Reason: {decision.reason}</span>
                </>}
              </div>
            )}
            {correcting ? (
              <CorrectForm c={c} initial={current} onCancel={() => { setCorrecting(false); requestAnimationFrame(() => correctBtn.current?.focus()); }} onSaved={afterDecision} />
            ) : (
              <div className="actions">
                {c.status === 'suggested' && <button type="button" className="btn primary" onClick={confirm} disabled={busy !== null}><Icon name="check" />{busy === 'confirm' ? 'Confirming' : 'Confirm triage'}<kbd className="kbd" aria-hidden="true">C</kbd></button>}
                {c.status === 'needs_manual_triage' && <button type="button" className="btn" onClick={retry} disabled={busy !== null}>{busy === 'retry' ? 'Asking the model' : 'Ask the model again'}</button>}
                <button type="button" ref={correctBtn} className={c.status === 'needs_manual_triage' ? 'btn primary' : 'btn'} onClick={() => setCorrecting(true)}><Icon name="pen" />{c.status === 'needs_manual_triage' ? 'Triage by hand' : decision ? 'Correct again' : 'Correct triage'}<kbd className="kbd" aria-hidden="true">R</kbd></button>
              </div>
            )}
            {error && <p className="alert" role="alert" style={{ margin: '0 16px 16px' }}>{error}</p>}
          </section>

          {next !== undefined && (
            <div className="notice" aria-live="polite">
              {next
                ? <>Saved. Next waiting for a decision: <Link ref={nextRef as React.Ref<HTMLAnchorElement>} to={`/complaints/${next.id}`}>{next.ref}, {next.device.ref}</Link></>
                : <p ref={nextRef as React.Ref<HTMLParagraphElement>} tabIndex={-1} style={{ margin: 0 }}>Saved. No other complaint is waiting for a decision.</p>}
            </div>
          )}

          <section className="panel" aria-labelledby="a-h">
            <h2 className="panel-h" id="a-h">Audit trail<span className="r">Append-only, hash-linked</span></h2>
            <ol className="audit">
              {c.audit.map((a) => (
                <li key={a.id} className={fresh === a.id ? 'fresh' : undefined}>
                  <span className="n">{a.seq}</span>
                  <div>
                    <div className="what">{a.type === 'model_output_rejected' && a.summary.startsWith('No model output') ? 'Model call failed' : AUDIT_LABEL[a.type]}</div>
                    <div className="meta">{stamp(a.at)}, {a.actor}</div>
                    <div className="sum">{a.summary}</div>
                    <div className="meta">Hash {a.hash.slice(0, 8)}{a.prevHash ? `, follows ${a.prevHash.slice(0, 8)}` : ''}</div>
                  </div>
                </li>
              ))}
              {isWaiting(c) && <li className="pending"><span className="n">{c.audit.length + 1}</span><div><div className="what">Waiting for a quality engineer</div><div className="meta">Confirm or correct to set the deadline</div></div></li>}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}

const AUDIT_LABEL: Record<ComplaintDetail['audit'][number]['type'], string> = {
  complaint_logged: 'Complaint logged',
  model_suggestion_stored: 'Model suggestion stored',
  model_output_rejected: 'Model output rejected',
  triage_confirmed: 'Triage confirmed',
  triage_corrected: 'Triage corrected',
  report_recorded: 'Report submission recorded',
};

function DetailSkeleton(): ReactNode {
  return (
    <div aria-busy="true" aria-label="Loading complaint">
      <span className="sk" style={{ display: 'block', width: 60, height: 12, background: 'var(--sunken)', marginBottom: 20 }} />
      <span className="sk" style={{ display: 'block', width: 220, height: 28, background: 'var(--sunken)', marginBottom: 28 }} />
      <div className="grid">
        <div className="stack"><div className="panel" style={{ height: 260 }} /><div className="panel" style={{ height: 220 }} /></div>
        <div className="stack"><div className="panel" style={{ height: 320 }} /><div className="panel" style={{ height: 200 }} /></div>
      </div>
    </div>
  );
}
