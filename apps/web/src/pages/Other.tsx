import { useState } from 'react';
import { Link } from 'react-router';
import { GLOSSARY, SOURCES } from '@playnt/shared';
import { api } from '../api';
import { useLoad, useTitle } from '../hooks';

const stamp = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Europe/Vienna', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '').replace('Sept', 'Sep');

export function AuditPage() {
  useTitle('Audit trail');
  const [load, reload] = useLoad(() => api.audit(), []);
  const [check, setCheck] = useState<Awaited<ReturnType<typeof api.verify>> | 'running' | null>(null);
  const run = async () => { setCheck('running'); setCheck(await api.verify()); };
  return (
    <>
      <div className="head">
        <div><h1>Audit trail</h1><p className="sub" style={{ margin: 0 }}>Every intake, model suggestion and decision, newest first. Events are appended, never changed; each one carries the hash of the one before.</p></div>
        <span className="spacer" />
        <button type="button" className="btn" onClick={run} disabled={check === 'running'}>{check === 'running' ? 'Checking' : 'Check the hash chain'}</button>
      </div>
      <div role="status" aria-live="polite">
        {check && check !== 'running' && (check.broken.length === 0
          ? <p className="notice">All {check.events} events across {check.complaints} complaints link correctly. Nothing was changed or removed.</p>
          : <div className="alert"><strong>{check.broken.length} problems found.</strong><ul>{check.broken.map((b) => <li key={`${b.complaintRef}-${b.seq}-${b.problem}`}>{b.complaintRef}, event {b.seq}: {b.problem}</li>)}</ul></div>)}
      </div>
      {load.state === 'error' && <div className="alert" role="alert"><strong>The audit trail could not be loaded.</strong> {load.error.message} <button type="button" className="btn" onClick={reload}>Try again</button></div>}
      {load.state === 'loading' && <div className="panel" style={{ height: 320 }} aria-busy="true" />}
      {load.state === 'ready' && (load.data.length === 0
        ? <div className="panel empty"><strong>No events yet.</strong>The first entry appears when a complaint is logged.</div>
        : (
          <table className="data">
            <thead><tr><th scope="col">Time, Vienna</th><th scope="col">Complaint</th><th scope="col" className="num">Event</th><th scope="col">What happened</th><th scope="col">By</th><th scope="col">Hash</th></tr></thead>
            <tbody>
              {load.data.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{stamp(e.at)}</td>
                  <td className="nowrap"><Link to={`/complaints/${e.complaintId}`}>{e.complaintRef}</Link></td>
                  <td className="num">{e.seq}</td>
                  <td style={{ maxWidth: '60ch' }}>{e.summary}</td>
                  <td>{e.actor}</td>
                  <td className="nowrap meta">{e.hash.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
    </>
  );
}

export function SourcesPage() {
  useTitle('Sources');
  return (
    <div style={{ maxWidth: '80ch' }}>
      <h1>Sources</h1>
      <p className="sub">Every regulatory term in Playnt, with the provision it comes from. MDCG guidance is not legally binding. ISO 13485:2016 is cited by clause number and title only.</p>
      <dl style={{ display: 'grid', gap: 16, margin: '24px 0' }}>
        {Object.entries(GLOSSARY).map(([k, g]) => (
          <div key={k} className="panel pbody">
            <dt style={{ fontWeight: 700 }}>{g.term}</dt>
            <dd style={{ margin: '4px 0 0' }}>{g.definition}<div className="meta" style={{ marginTop: 8 }}>{g.cite}. <a href={SOURCES[g.source].url}>{SOURCES[g.source].label}</a></div></dd>
          </div>
        ))}
      </dl>
      <h2>Documents</h2>
      <ul className="doclist">{Object.values(SOURCES).map((s) => <li key={s.url}><a href={s.url}>{s.label}</a></li>)}</ul>
    </div>
  );
}
