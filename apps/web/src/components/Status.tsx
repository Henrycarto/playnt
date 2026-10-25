import { computeDeadline, DeadlineRangeError, timeLeft, viennaDate, type ComplaintStatus, type ComplaintSummary } from '@playnt/shared';
import { Icon } from './Icon';
import { Tip } from './Term';

// Queue: red text with the icon, the row carries a red rule. Detail header: the bordered pill.
export function Flag({ c, pill = false }: { c: Pick<ComplaintSummary, 'possibleSeriousIncident' | 'isComplaint'>; pill?: boolean }) {
  if (c.possibleSeriousIncident) return <span className={pill ? 'flag serious' : 'flagtext serious'}><Icon name="serious" />Possible serious incident</span>;
  if (c.possibleSeriousIncident === null) return <span className="flagtext quiet">Not assessed</span>;
  return <span className="flagtext quiet">{c.isComplaint ? 'Not serious' : 'Not a complaint'}</span>;
}

const STATUS: Record<ComplaintStatus, { cls: string; icon: 'suggested' | 'manual' | 'check' | 'pen'; text: string }> = {
  suggested: { cls: 'suggested', icon: 'suggested', text: 'Suggested' },
  needs_manual_triage: { cls: 'manual', icon: 'manual', text: 'Needs manual triage' },
  confirmed: { cls: 'decided', icon: 'check', text: 'Confirmed' },
  corrected: { cls: 'decided', icon: 'pen', text: 'Corrected' },
};

export function TriageStatus({ status, long = false }: { status: ComplaintStatus; long?: boolean }) {
  const s = STATUS[status];
  return <span className={`tstatus ${s.cls}`}><Icon name={s.icon} />{long && status === 'suggested' ? 'Suggested, waiting for a decision' : s.text}</span>;
}

// Problem descriptions are stored as written by the model or the engineer; only the display starts them with a capital.
export const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '').replace('Sept', 'Sep'); // en-GB writes "Sept"

// Compact day row for the queue, capped at 120 px so 15-day rows stay small.
export function DayTrack({ awarenessDate, limitDays, now }: { awarenessDate: string; limitDays: 2 | 10 | 15; now: string }) {
  let d;
  try { d = computeDeadline(awarenessDate, limitDays); } catch (e) { if (e instanceof DeadlineRangeError) return null; throw e; }
  const today = viennaDate(now);
  const days = d.days.slice(1);
  const cell = Math.max(4, Math.min(8, Math.floor((120 - 2 * (days.length - 1)) / days.length)));
  const elapsed = days.filter((x) => x.date < today).length;
  return (
    <Tip
      className="track-btn"
      label={
        <span className="track" style={{ ['--cell' as string]: `${cell}px` }} aria-label={`Day track: ${elapsed} of ${days.length} days elapsed. Show legend.`}>
          {days.map((x) => (
            <i key={x.date} className={[x.date < today && 'past', x.date === today && 'today', x.rest && 'rest', x.extension && 'ext'].filter(Boolean).join(' ')} />
          ))}
        </span>
      }
    >
      <b>One cell per calendar day after the awareness date</b>
      <span className="legend">
        <span><i className="past" />Filled: day has passed</span>
        <span><i className="today" />Outlined: today</span>
        <span><i className="rest" />Hatched: weekend or Austrian public holiday</span>
        <span><i className="ext" />Dashed: added because the last day was not a working day</span>
      </span>
      <span className="cite">Regulation 1182/71 Art. 3(4) and 3(5); MDCG 2023-3 Rev.2, Q14</span>
    </Tip>
  );
}

export function DueCell({ c, now }: { c: ComplaintSummary; now: string }) {
  if (c.status === 'needs_manual_triage') return <div className="due"><span className="none">Limit not set until triaged</span><span className="meta">Awareness {fmtDay(c.awarenessDate)}</span></div>;
  if (!c.dueAt || !c.limitDays) {
    if (c.limitDays) return <div className="due"><span className="none">Deadline outside the 2026 to 2027 holiday calendar</span></div>;
    return <div className="due"><span className="none">No reporting limit</span>{c.isComplaint !== false && <span className="meta">Counts towards trends</span>}</div>;
  }
  const dueDate = viennaDate(c.dueAt);
  if (c.reportedOn) {
    const late = c.reportedOn > dueDate;
    return <div className="due"><span className={late ? 'left late' : 'reported'}><Icon name="check" />Report submitted {fmtDay(c.reportedOn)}</span><span className="meta">{late ? `After the deadline of ${fmtDay(dueDate)}` : `Within the deadline of ${fmtDay(dueDate)}`}</span></div>;
  }
  const l = timeLeft(c.dueAt, now);
  return (
    <div className={`due${l.overdue ? ' over' : l.soon ? ' soon' : ''}`}>
      {l.overdue ? <span className="over-badge"><Icon name="clock" />{l.text}</span> : <span className="left">{l.text}</span>}
      <DayTrack awarenessDate={c.awarenessDate} limitDays={c.limitDays} now={now} />
      <span className="meta">Due {fmtDay(dueDate)}{c.deadlineBasis === 'suggested' ? ' if confirmed' : ''}</span>
    </div>
  );
}
