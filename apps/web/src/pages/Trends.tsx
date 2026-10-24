import { Fragment, useState } from 'react';
import { api } from '../api';
import { Term } from '../components/Term';
import { useLoad, useTitle } from '../hooks';

const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'];
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

export function Trends() {
  useTitle('Trends');
  const [range] = useState({ from: '2026-01-01', to: '2026-12-31' });
  const [load, reload] = useLoad(() => api.trends(range.from, range.to), [range.from, range.to]);

  if (load.state === 'loading') return <><h1>Trends</h1><p className="sub">Counting complaints</p><div className="panel" style={{ height: 240, marginTop: 16 }} aria-busy="true" /></>;
  if (load.state === 'error') return <div className="alert" role="alert"><strong>Trends could not be loaded.</strong> {load.error.message} <button type="button" className="btn" onClick={reload}>Try again</button></div>;

  const { rows, perMonth, awaitingDecision } = load.data;
  const devices = [...new Set(perMonth.map((r) => r.deviceRef))].sort();
  const cell = (m: string, d: string) => perMonth.find((r) => r.month === m && r.deviceRef === d);
  const max = Math.max(1, ...perMonth.map((r) => r.count));
  const level = (n: number) => (n === 0 ? '' : n / max > 0.66 ? 'l3' : n / max > 0.33 ? 'l2' : 'l1');
  const months = MONTHS.filter((m) => m <= (perMonth.at(-1)?.month ?? '2026-12'));
  const byMonth = new Map<string, typeof rows>();
  for (const r of rows) byMonth.set(r.month, [...(byMonth.get(r.month) ?? []), r]);

  return (
    <>
      <div className="head"><div>
        <h1>Trends</h1>
        <p className="sub" style={{ margin: 0 }}>Complaints per device and month in 2026, from decided triage only. {awaitingDecision > 0 && `${awaitingDecision} waiting for a decision are not counted.`}</p>
      </div></div>

      {perMonth.length === 0 ? (
        <div className="panel empty"><strong>No decided complaints in this period.</strong>Counts appear once a quality engineer confirms or corrects a triage.</div>
      ) : (
        <>
          <table className="data heat">
            <caption className="sr-only">Decided complaints per device and month. A second number marks possible serious incidents.</caption>
            <thead><tr><th scope="col">Device</th>{months.map((m) => <th key={m} scope="col" className="num">{monthName(m)}</th>)}<th scope="col" className="num">Total</th></tr></thead>
            <tbody>
              {devices.map((d) => {
                const total = perMonth.filter((r) => r.deviceRef === d).reduce((a, r) => a + r.count, 0);
                return (
                  <tr key={d}>
                    <th scope="row">{d}</th>
                    {months.map((m) => {
                      const r = cell(m, d);
                      return (
                        <td key={m} className="num">
                          {r ? <><span className={`cell ${level(r.count)}`}>{r.count}</span><span className="s">{r.possibleSerious > 0 ? <>{r.possibleSerious}<span className="sr-only"> possible serious</span></> : ''}</span></> : <span className="meta">0</span>}
                        </td>
                      );
                    })}
                    <td className="num"><b>{total}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="note" style={{ marginTop: 8 }}>Shade shows the count. The red number beside a count is how many of them were possible serious incidents.</p>

          <h2 style={{ margin: '24px 0 8px' }}>Problems by month</h2>
          <table className="data">
            <thead><tr><th scope="col">Month</th><th scope="col">Device</th><th scope="col">Problem, as recorded at triage</th><th scope="col" className="num">Complaints</th><th scope="col" className="num">Possible serious</th></tr></thead>
            <tbody>
              {[...byMonth.entries()].map(([m, list]) => (
                <Fragment key={m}>
                  {list.map((r, i) => (
                    <tr key={`${m}-${r.deviceRef}-${r.problem}`}>
                      <td>{i === 0 ? `${monthName(m)} ${m.slice(0, 4)}` : ''}</td><td>{r.deviceRef}</td><td>{r.problem}</td><td className="num">{r.count}</td><td className="num">{r.possibleSerious || ''}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="note" style={{ marginTop: 16, maxWidth: '80ch' }}>
        These are counts, not a trend report. <Term k="trendReporting" up>Trend reporting under Article 88</Term> needs a statistically significant increase measured with a method and observation period set in the post-market surveillance plan, which this simulation does not define. Problem descriptions are free text; coding them with IMDRF Annex A terms is a next step.
      </p>
    </>
  );
}
