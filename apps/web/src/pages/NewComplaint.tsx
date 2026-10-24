import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { CHANNELS, viennaDate, type ComplaintInput, type DeviceView } from '@playnt/shared';
import { api, RequestError } from '../api';
import { Icon } from '../components/Icon';
import { Term } from '../components/Term';
import { useHealth, useLoad, useTitle } from '../hooks';

type Field = keyof ComplaintInput;

export function NewComplaint() {
  useTitle('Log complaint');
  const navigate = useNavigate();
  const health = useHealth();
  const [devices] = useLoad<DeviceView[]>(() => api.devices(), []);
  const [samples] = useLoad(() => api.samples(), []);
  const [v, setV] = useState<ComplaintInput>({ deviceId: '', text: '', reporterRole: '', reporterCountry: 'Austria', channel: 'phone', awarenessDate: '' });
  const [errors, setErrors] = useState<Partial<Record<Field | 'form', string>>>({});
  const [saving, setSaving] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (health && !v.awarenessDate) setV((x) => ({ ...x, awarenessDate: viennaDate(health.now) }));
  }, [health, v.awarenessDate]);

  const up = (k: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  function applySample(i: string) {
    if (i === '' || samples.state !== 'ready' || devices.state !== 'ready') return;
    const s = samples.data[Number(i)]!;
    const d = devices.data.find((x) => x.ref === s.device);
    setV({ ...v, text: s.text, reporterRole: s.reporterRole, channel: s.channel as ComplaintInput['channel'], deviceId: d?.id ?? '' });
    setErrors({});
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local: typeof errors = {};
    if (!v.deviceId) local.deviceId = 'Choose the device the complaint is about.';
    if (v.text.trim().length < 20) local.text = 'Enter the complaint as received, at least 20 characters.';
    if (v.reporterRole.trim().length < 2) local.reporterRole = 'Enter the reporter\'s role, for example "Ward nurse". No names.';
    if (!v.awarenessDate) local.awarenessDate = 'Enter the date the complaint reached the company.';
    else if (health && v.awarenessDate > viennaDate(health.now)) local.awarenessDate = 'The awareness date cannot be in the future.';
    setErrors(local);
    if (Object.keys(local).length) {
      requestAnimationFrame(() => (form.current?.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus());
      return;
    }
    setSaving(true);
    try {
      const d = await api.create({ ...v, text: v.text.trim(), reporterRole: v.reporterRole.trim() });
      navigate(`/complaints/${d.id}`);
    } catch (err) {
      const body = err instanceof RequestError ? err.body : { error: String(err) };
      const next: typeof errors = { form: `Not saved. ${body.error}` };
      for (const i of body.issues ?? []) if (i.path in v) next[i.path as Field] = i.message;
      setErrors(next);
      setSaving(false);
    }
  }

  const fieldProps = (k: Field) => ({ id: k, 'aria-invalid': !!errors[k], 'aria-describedby': errors[k] ? `e-${k}` : `h-${k}` });
  const err = (k: Field) => errors[k] && <div className="errmsg" id={`e-${k}`}><Icon name="manual" />{errors[k]}</div>;

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="head"><div><h1>Log complaint</h1><p className="sub" style={{ margin: 0 }}>Enter the complaint as it was received. The model suggests a triage straight away; you confirm or correct it on the next screen.</p></div></div>
      {health?.mode === 'demo' && samples.state === 'ready' && (
        <div className="notice" style={{ marginBottom: 16 }}>
          <label className="lbl" htmlFor="sample">Demo mode replays recorded model responses</label>
          <select id="sample" className="select wide" defaultValue="" onChange={(e) => applySample(e.target.value)}>
            <option value="">Start from one of the recorded sample complaints</option>
            {samples.data.map((s, i) => <option key={i} value={i}>{s.device}: {s.text.slice(0, 70)}</option>)}
          </select>
          <div className="hint">Any other text is saved and goes to manual triage, because demo mode has no recorded response for it.</div>
        </div>
      )}
      <form className="panel pbody stackform" onSubmit={submit} noValidate ref={form}>
        <div className="formgrid">
          <div>
            <label className="lbl" htmlFor="deviceId">Device</label>
            <select {...fieldProps('deviceId')} className="select wide" value={v.deviceId} onChange={up('deviceId')}>
              <option value="">Choose a device</option>
              {devices.state === 'ready' && devices.data.map((d) => <option key={d.id} value={d.id}>{d.name}, class {d.riskClass}</option>)}
            </select>
            {err('deviceId') || <div className="hint" id="h-deviceId">The device's risk file is sent to the model with the text.</div>}
          </div>
          <div>
            <label className="lbl" htmlFor="awarenessDate"><Term k="awarenessDate">Awareness date</Term></label>
            <input type="date" {...fieldProps('awarenessDate')} className="input wide" value={v.awarenessDate} onChange={up('awarenessDate')} />
            {err('awarenessDate') || <div className="hint" id="h-awarenessDate">The day anyone at the company first received it. Day 0 of the reporting period.</div>}
          </div>
          <div>
            <label className="lbl" htmlFor="reporterRole">Reporter's role</label>
            <input {...fieldProps('reporterRole')} className="input wide" value={v.reporterRole} onChange={up('reporterRole')} maxLength={80} autoComplete="off" />
            {err('reporterRole') || <div className="hint" id="h-reporterRole">A role, not a name. Not sent to the model.</div>}
          </div>
          <div>
            <label className="lbl" htmlFor="channel">Received by</label>
            <select {...fieldProps('channel')} className="select wide" value={v.channel} onChange={up('channel')}>
              {CHANNELS.map((ch) => <option key={ch} value={ch}>{ch[0]!.toUpperCase() + ch.slice(1)}</option>)}
            </select>
            <div className="hint" id="h-channel">&nbsp;</div>
          </div>
        </div>
        <div>
          <label className="lbl" htmlFor="text">Complaint text</label>
          <textarea {...fieldProps('text')} className="input" rows={6} value={v.text} onChange={up('text')} maxLength={4000} />
          {err('text') || <div className="hint" id="h-text">Copy it as received. It is stored unchanged and cannot be edited later.</div>}
        </div>
        {errors.form && <div className="alert" role="alert">{errors.form}</div>}
        <div><button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving and asking the model' : 'Log complaint'}</button></div>
      </form>
    </div>
  );
}
