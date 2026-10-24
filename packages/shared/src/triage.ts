import { z } from 'zod';

// Serious incident outcomes and the reporting time limit each one triggers.
// MDR Art. 87(3) 15 days, 87(4) 2 days, 87(5) 10 days. "Unanticipated" per MDCG 2023-3 Rev.2 Q12.
export const SERIOUS_OUTCOMES = [
  'public_health_threat',
  'death',
  'serious_deterioration_unanticipated',
  'serious_deterioration_anticipated',
  'might_have_led',
  'none',
] as const;
export type SeriousOutcome = (typeof SERIOUS_OUTCOMES)[number];

export const LIMIT_DAYS = [2, 10, 15] as const;
export type LimitDays = (typeof LIMIT_DAYS)[number];

export const OUTCOME_LIMIT: Record<SeriousOutcome, LimitDays | null> = {
  public_health_threat: 2,
  death: 10,
  serious_deterioration_unanticipated: 10,
  serious_deterioration_anticipated: 15,
  might_have_led: 15,
  none: null,
};

export const LIMIT_ARTICLE: Record<LimitDays, string> = { 2: 'Art. 87(4)', 10: 'Art. 87(5)', 15: 'Art. 87(3)' };

export const OUTCOME_LABEL: Record<SeriousOutcome, string> = {
  public_health_threat: 'Serious public health threat',
  death: 'Death',
  serious_deterioration_unanticipated: 'Serious deterioration, unanticipated',
  serious_deterioration_anticipated: 'Serious deterioration, anticipated',
  might_have_led: 'Might have led to a serious outcome',
  none: 'No serious outcome',
};

const text = (max: number) => z.string().trim().min(1).max(max);

const triageFields = {
  isComplaint: z.boolean(),
  possibleSeriousIncident: z.boolean(),
  seriousOutcome: z.enum(SERIOUS_OUTCOMES),
  timeLimitDays: z.union([z.literal(2), z.literal(10), z.literal(15), z.null()]),
  problemDescription: text(200),
  rationale: text(400),
};

export type TriageIssue = { path: string; message: string };

// Rules that hold for every triage, from the model or from a person.
export function triageConsistency(t: {
  isComplaint: boolean;
  possibleSeriousIncident: boolean;
  seriousOutcome: SeriousOutcome;
  timeLimitDays: LimitDays | null;
}): TriageIssue[] {
  const issues: TriageIssue[] = [];
  if (!t.isComplaint && t.possibleSeriousIncident) {
    issues.push({ path: 'possibleSeriousIncident', message: 'A communication that is not a complaint cannot be a possible serious incident.' });
  }
  if (t.possibleSeriousIncident !== (t.seriousOutcome !== 'none')) {
    issues.push({ path: 'seriousOutcome', message: 'Serious outcome must be "none" exactly when the complaint is not a possible serious incident.' });
  }
  if (OUTCOME_LIMIT[t.seriousOutcome] !== t.timeLimitDays) {
    issues.push({ path: 'timeLimitDays', message: `Time limit must be ${OUTCOME_LIMIT[t.seriousOutcome] ?? 'null'} for outcome "${t.seriousOutcome}".` });
  }
  return issues;
}

// What the model must return. Strict: unknown keys are rejected, nothing is coerced.
export const ModelTriageSchema = z.strictObject({ ...triageFields, evidenceQuote: text(400) });
export type ModelTriage = z.infer<typeof ModelTriageSchema>;

// What a quality engineer records when correcting or triaging by hand.
export const HumanTriageSchema = z.strictObject({ ...triageFields, evidenceQuote: text(400).nullable() });
export type HumanTriage = z.infer<typeof HumanTriageSchema>;

export const DecisionInputSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('confirm') }),
  z.strictObject({
    action: z.literal('correct'),
    triage: HumanTriageSchema,
    reason: z.string().trim().min(10, 'Enter a reason of at least 10 characters.').max(1000),
  }),
]);
export type DecisionInput = z.infer<typeof DecisionInputSchema>;

export type ParseResult =
  | { ok: true; triage: ModelTriage }
  | { ok: false; error: string };

// Parse raw model output. Anything that is not exactly right is rejected, never repaired.
export function parseModelOutput(raw: string, complaintText: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Output is not valid JSON.' };
  }
  const parsed = ModelTriageSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Output does not match the triage schema: ${first?.path.join('.') || '(root)'} ${first?.message ?? ''}`.trim() };
  }
  const issues = triageConsistency(parsed.data);
  if (issues.length > 0) return { ok: false, error: `Output is inconsistent: ${issues.map((i) => i.message).join(' ')}` };
  if (!complaintText.includes(parsed.data.evidenceQuote)) {
    return { ok: false, error: 'Evidence quote is not an exact passage of the complaint text.' };
  }
  return { ok: true, triage: parsed.data };
}
