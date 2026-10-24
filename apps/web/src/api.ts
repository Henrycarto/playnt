import type { ApiError, AuditEventView, ComplaintDetail, ComplaintInput, ComplaintSummary, DecisionInput, DeviceView, TrendRow } from '@playnt/shared';

export class RequestError extends Error {
  constructor(readonly status: number, readonly body: ApiError) {
    super(body.error);
  }
}

const base = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base}/api${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  } catch {
    throw new RequestError(0, { error: 'The Playnt server is not reachable. Check that the API is running, then try again.' });
  }
  const body = await res.json().catch(() => ({ error: `The server answered ${res.status} without a readable body.` }));
  if (!res.ok) throw new RequestError(res.status, body as ApiError);
  return body as T;
}

export interface Health { ok: boolean; mode: string; provider: string; model: string; now: string }

export const api = {
  health: () => call<Health>('/health'),
  devices: () => call<DeviceView[]>('/devices'),
  samples: () => call<{ device: string; reporterRole: string; channel: string; text: string }[]>('/samples'),
  complaints: (q: URLSearchParams) => call<ComplaintSummary[]>(`/complaints?${q}`),
  complaint: (id: string) => call<ComplaintDetail>(`/complaints/${id}`),
  create: (input: ComplaintInput) => call<ComplaintDetail>('/complaints', { method: 'POST', body: JSON.stringify(input) }),
  decide: (id: string, input: DecisionInput) => call<ComplaintDetail>(`/complaints/${id}/decisions`, { method: 'POST', body: JSON.stringify(input) }),
  report: (id: string, submittedOn: string) => call<ComplaintDetail>(`/complaints/${id}/report`, { method: 'POST', body: JSON.stringify({ submittedOn }) }),
  retry: (id: string) => call<ComplaintDetail>(`/complaints/${id}/retry`, { method: 'POST' }),
  trends: (from: string, to: string) =>
    call<{ rows: TrendRow[]; perMonth: { month: string; deviceRef: string; count: number; possibleSerious: number }[]; awaitingDecision: number }>(`/trends?from=${from}&to=${to}`),
  audit: () => call<AuditEventView[]>('/audit'),
  verify: () => call<{ complaints: number; events: number; broken: { complaintRef: string; seq: number; problem: string }[] }>('/audit/verify'),
};
