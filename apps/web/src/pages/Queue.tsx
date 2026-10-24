import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { LIMIT_ARTICLE, type ComplaintSummary, type DeviceView } from '@playnt/shared';
import { api } from '../api';
import { Icon } from '../components/Icon';
import { isTyping } from '../components/Shortcuts';
import { DueCell, Flag, fmtDay, TriageStatus } from '../components/Status';
import { useHealth, useLoad, useTitle } from '../hooks';

const STATUS_FILTERS = [
  ['waiting', 'Waiting for a decision'],
  ['needs_manual_triage', 'Needs manual triage'],
  ['decided', 'Decided'],
  ['all', 'All'],
] as const;

export const isWaiting = (c: ComplaintSummary) => c.status === 'suggested' || c.status === 'needs_manual_triage';

export function Queue() {
  useTitle('Complaint queue');
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'waiting';
  const device = params.get('device') ?? '';
  const serious = params.get('serious') === 'true';
  const navigate = useNavigate();
  const health = useHealth();
  const [devices] = useLoad<DeviceView[]>(() => api.devices(), []);
  const query = useMemo(() => {
    const q = new URLSearchParams({ status });
    if (device) q.set('deviceId', device);
    if (serious) q.set('serious', 'true');
    return q;
  }, [status, device, serious]);
  const [list, reload, setList] = useLoad<ComplaintSummary[]>(() => api.complaints(query), [query.toString()]);
  const [cursor, setCursor] = useState(0);
  const [fresh, setFresh] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const rows = useRef<(HTMLTableRowElement | null)[]>([]);

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '') next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
    setCursor(0);
  };

  const data = list.state === 'ready' ? list.data : [];
  const focusRow = (i: number) => {
    const n = Math.max(0, Math.min(data.length - 1, i));
    setCursor(n);
    rows.current[n]?.focus();
  };

  async function confirmAt(i: number) {
    const c = data[i];
    if (!c || busy) return;
    if (c.status !== 'suggested') {
      setMessage(c.status === 'needs_manual_triage' ? `${c.ref} has no usable model suggestion. Press R to triage it by hand.` : `${c.ref} is already decided. Press R to correct it.`);
      return;
    }
    setBusy(true);
    try {
      const d = await api.decide(c.id, { action: 'confirm' });
      const updated = data.map((x) => (x.id === d.id ? { ...x, ...summaryOf(d) } : x));
      setList(updated);
      setFresh(d.id);
      const next = nextWaiting(updated, i);
      setMessage(`${d.ref} confirmed: ${d.possibleSeriousIncident ? `${d.limitDays}-day limit, due ${fmtDay(d.deadline!.dueDate)}` : 'no reporting limit'}. ${next === null ? 'Nothing else is waiting.' : `Next waiting: ${updated[next]!.ref}.`}`);
      if (next !== null) focusRow(next);
    } catch (e) {
      setMessage(`${c.ref} was not confirmed. ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || document.querySelector('dialog[open]')) return;
      if (!data.length) return;
      const k = e.key;
      if (k === 'j' || k === 'ArrowDown') { e.preventDefault(); focusRow(cursor + (document.activeElement === rows.current[cursor] ? 1 : 0)); }
      else if (k === 'k' || k === 'ArrowUp') { e.preventDefault(); focusRow(cursor - 1); }
      else if (k === 'Enter' && document.activeElement === rows.current[cursor]) { e.preventDefault(); navigate(`/complaints/${data[cursor]!.id}`); }
      else if (k === 'c') { e.preventDefault(); void confirmAt(cursor); }
      else if (k === 'r') { e.preventDefault(); navigate(`/complaints/${data[cursor]!.id}?correct=1`); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const waitingCount = data.filter(isWaiting).length;
  const seriousCount = data.filter((c) => c.possibleSeriousIncident).length;
  const filtered = status !== 'waiting' || device || serious;

  return (
    <>
      <div className="head">
        <div>
          <h1>Complaint queue</h1>
          <p className="sub" style={{ margin: 0 }}>
            {list.state === 'ready'
              ? `${data.length} shown, ${waitingCount} waiting for a decision, ${seriousCount} flagged as possible serious incidents. Nearest deadline first.`
              : 'Loading complaints'}
          </p>
        </div>
        <span className="spacer" />
        <Link className="btn primary" to="/new"><Icon name="plus" />Log complaint</Link>
      </div>

      <div className="filters" role="group" aria-label="Filter the queue">
        <span className="fgroup"><span className="glabel" id="f-status">Triage</span>
          <span className="chips" role="group" aria-labelledby="f-status">
            {STATUS_FILTERS.map(([v, l]) => <button key={v} type="button" className="fchip" aria-pressed={status === v} onClick={() => set('status', v === 'waiting' ? null : v)}>{l}</button>)}
          </span>
        </span>
        <span className="fgroup"><span className="glabel" id="f-device">Device</span>
          <span className="chips" role="group" aria-labelledby="f-device">
            <button type="button" className="fchip" aria-pressed={!device} onClick={() => set('device', null)}>All</button>
            {devices.state === 'ready' && devices.data.map((d) => <button key={d.id} type="button" className="fchip" aria-pressed={device === d.id} onClick={() => set('device', d.id)} title={d.name}>{d.ref}</button>)}
          </span>
        </span>
        <button type="button" className="fchip" aria-pressed={serious} onClick={() => set('serious', serious ? null : 'true')}>Possible serious incidents only</button>
      </div>

      <table className="queue" aria-describedby="queue-help">
        <caption className="sr-only">Complaints. Use J and K or the arrow keys to move, Enter to open, C to confirm, R to correct.</caption>
        <thead>
          <tr><th scope="col">Deadline</th><th scope="col">Flag</th><th scope="col">Complaint</th><th scope="col">Device</th><th scope="col">Limit</th><th scope="col">Triage</th><th scope="col" className="col-aware">Awareness</th></tr>
        </thead>
        <tbody>
          {(list.state === 'loading' || !health) && Array.from({ length: 6 }, (_, i) => (
            <tr key={i} className="skel" aria-hidden="true">
              <td><span className="sk" style={{ width: 96 }} /><span className="sk" style={{ width: 120, height: 8, marginTop: 8 }} /></td>
              <td><span className="sk" style={{ width: 140 }} /></td>
              <td><span className="sk" style={{ width: 96 }} /><span className="sk" style={{ width: '90%', marginTop: 8 }} /><span className="sk" style={{ width: '70%', marginTop: 6 }} /></td>
              <td><span className="sk" style={{ width: 120 }} /></td>
              <td><span className="sk" style={{ width: 48 }} /></td>
              <td><span className="sk" style={{ width: 88 }} /></td>
              <td className="col-aware"><span className="sk" style={{ width: 72 }} /></td>
            </tr>
          ))}
          {list.state === 'ready' && health && data.map((c, i) => (
            <tr
              key={c.id}
              ref={(el) => { rows.current[i] = el; }}
              tabIndex={i === cursor ? 0 : -1}
              className={[c.possibleSeriousIncident && 'is-serious', fresh === c.id && 'fresh'].filter(Boolean).join(' ')}
              aria-label={`${c.ref}, ${c.device.ref}${c.possibleSeriousIncident ? ', possible serious incident' : ''}, ${c.status.replace(/_/g, ' ')}`}
              onFocus={() => setCursor(i)}
              onClick={(e) => { if (!(e.target as HTMLElement).closest('a, button')) navigate(`/complaints/${c.id}`); }}
            >
              <td><DueCell c={c} now={health.now} /></td>
              <td><Flag c={c} /></td>
              <td><Link className="ref" to={`/complaints/${c.id}`} tabIndex={-1}>{c.ref}</Link><div className="summary">{c.text}</div></td>
              <td className="nowrap">{c.device.ref}<div className="meta">{c.device.name.slice(c.device.ref.length + 1)}</div></td>
              <td className="nowrap">{c.limitDays ? <>{c.limitDays} days<div className="meta">{LIMIT_ARTICLE[c.limitDays]}</div></> : <span className="meta">None</span>}</td>
              <td><TriageStatus status={c.status} /></td>
              <td className="col-aware nowrap">{fmtDay(c.awarenessDate)}<div className="meta">{c.awarenessDate.slice(0, 4)}</div></td>
            </tr>
          ))}
        </tbody>
      </table>

      {list.state === 'ready' && data.length === 0 && (
        <div className="panel empty" style={{ borderTop: 0, borderRadius: '0 0 6px 6px' }}>
          {filtered
            ? <><strong>No complaints match these filters.</strong><button type="button" className="btn" style={{ marginTop: 12 }} onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</button></>
            : <><strong>Nothing waiting. New complaints appear here.</strong>Log a complaint as it comes in; the model suggests a triage and you confirm or correct it. <div style={{ marginTop: 12 }}><Link className="btn" to="/new">Log complaint</Link></div></>}
        </div>
      )}
      {list.state === 'error' && (
        <div className="alert" role="alert" style={{ marginTop: 12 }}>
          <strong>The queue could not be loaded.</strong> {list.error.message} <button type="button" className="btn" style={{ marginLeft: 8 }} onClick={reload}>Try again</button>
        </div>
      )}

      <p className="statusline" role="status" aria-live="polite">{message}</p>
      <p className="note" id="queue-help">
        Deadlines count calendar days from the awareness date and end at 23:59 Vienna time. A last day on a weekend or Austrian public holiday moves to the next working day; other Member States have other public holidays. Report immediately: the deadline is the latest date. Press <kbd className="kbd">?</kbd> for keyboard shortcuts.
      </p>
    </>
  );
}

export function summaryOf(d: ComplaintSummary): ComplaintSummary {
  const { id, ref, device, text, awarenessDate, receivedAt, status, isComplaint, possibleSeriousIncident, limitDays, deadlineBasis, dueAt, reportedOn } = d;
  return { id, ref, device, text, awarenessDate, receivedAt, status, isComplaint, possibleSeriousIncident, limitDays, deadlineBasis, dueAt, reportedOn };
}

export function nextWaiting(list: ComplaintSummary[], from: number): number | null {
  for (let step = 1; step <= list.length; step++) {
    const i = (from + step) % list.length;
    if (i !== from && isWaiting(list[i]!)) return i;
  }
  return null;
}
