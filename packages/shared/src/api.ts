import { z } from 'zod';
import type { Deadline } from './deadline.js';
import type { HumanTriage, LimitDays, ModelTriage } from './triage.js';

export const CHANNELS = ['phone', 'email', 'web form', 'letter', 'field service'] as const;

export const ComplaintInputSchema = z.strictObject({
  deviceId: z.string().regex(/^[a-f0-9]{24}$/, 'Choose a device.'),
  text: z.string().trim().min(20, 'Enter at least 20 characters of the complaint.').max(4000),
  reporterRole: z.string().trim().min(2, 'Enter the reporter\'s role.').max(80),
  reporterCountry: z.string().trim().min(2).max(56),
  channel: z.enum(CHANNELS),
  awarenessDate: z.iso.date({ message: 'Enter the awareness date.' }),
});
export type ComplaintInput = z.infer<typeof ComplaintInputSchema>;

export const ReportInputSchema = z.strictObject({ submittedOn: z.iso.date({ message: 'Enter the date the report was submitted.' }) });
export type ReportInput = z.infer<typeof ReportInputSchema>;

export const COMPLAINT_STATUSES = ['suggested', 'needs_manual_triage', 'confirmed', 'corrected'] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const STATUS_LABEL: Record<ComplaintStatus, string> = {
  suggested: 'Suggested',
  needs_manual_triage: 'Needs manual triage',
  confirmed: 'Confirmed',
  corrected: 'Corrected',
};

export const ListQuerySchema = z.strictObject({
  status: z.enum([...COMPLAINT_STATUSES, 'action', 'waiting', 'decided', 'all']).default('all'),
  deviceId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  serious: z.enum(['true', 'false']).optional(),
});

export interface DeviceView {
  id: string;
  ref: string;
  name: string;
  riskClass: string;
  intendedUse: string;
  anticipatedHarms: string[];
  expectedSideEffects: string[];
}

export interface ModelSuggestionEntry {
  kind: 'model_suggestion';
  at: string;
  provider: string;
  model: string;
  promptVersion: string;
  raw: string | null;
  triage: ModelTriage | null;
  error: string | null;
}

export interface HumanDecisionEntry {
  kind: 'human_decision';
  at: string;
  action: 'confirm' | 'correct';
  by: string;
  triage: HumanTriage;
  reason: string | null;
}

export type TriageHistoryEntry = ModelSuggestionEntry | HumanDecisionEntry;

export interface ComplaintSummary {
  id: string;
  ref: string;
  device: { id: string; ref: string; name: string };
  text: string;
  awarenessDate: string;
  receivedAt: string;
  status: ComplaintStatus;
  isComplaint: boolean | null;
  possibleSeriousIncident: boolean | null;
  limitDays: LimitDays | null;
  deadlineBasis: 'suggested' | 'decided' | null;
  dueAt: string | null;
  reportedOn: string | null;
}

export interface ComplaintDetail extends ComplaintSummary {
  reporter: { role: string; country: string };
  channel: (typeof CHANNELS)[number];
  deviceDetail: DeviceView;
  triageHistory: TriageHistoryEntry[];
  deadline: Deadline | null;
  audit: AuditEventView[];
}

export interface AuditEventView {
  id: string;
  complaintId: string;
  complaintRef: string;
  seq: number;
  type: 'complaint_logged' | 'model_suggestion_stored' | 'model_output_rejected' | 'triage_confirmed' | 'triage_corrected' | 'report_recorded';
  at: string;
  actor: string;
  summary: string;
  hash: string;
  prevHash: string | null;
}

export interface TrendRow {
  month: string; // YYYY-MM
  deviceRef: string;
  deviceName: string;
  problem: string;
  count: number;
  possibleSerious: number;
}

export interface ApiError {
  error: string;
  issues?: { path: string; message: string }[];
}
