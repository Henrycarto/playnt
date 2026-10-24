import { describe, expect, it } from 'vitest';
import { DecisionInputSchema, parseModelOutput } from './triage.js';

const text = 'The pump display froze and delivery stopped without any alarm. The patient was moved to intensive care.';
const good = {
  isComplaint: true,
  possibleSeriousIncident: true,
  seriousOutcome: 'serious_deterioration_unanticipated',
  timeLimitDays: 10,
  problemDescription: 'Display froze, delivery stopped without alarm',
  evidenceQuote: 'The patient was moved to intensive care.',
  rationale: 'ICU admission after a silent stop that is not in the risk file.',
};

describe('parseModelOutput', () => {
  it('accepts a well-formed, consistent suggestion', () => {
    const r = parseModelOutput(JSON.stringify(good), text);
    expect(r.ok).toBe(true);
  });

  it.each([
    ['not JSON', '{"isComplaint": true,', /not valid JSON/],
    ['JSON in a code fence', '```json\n' + JSON.stringify(good) + '\n```', /not valid JSON/],
    ['a missing field', JSON.stringify({ ...good, rationale: undefined }), /schema/],
    ['an extra field', JSON.stringify({ ...good, confidence: 0.9 }), /schema/],
    ['a string instead of a boolean', JSON.stringify({ ...good, isComplaint: 'yes' }), /schema/],
    ['a time limit that does not match the outcome', JSON.stringify({ ...good, timeLimitDays: 15 }), /inconsistent/],
    ['a serious incident with outcome none', JSON.stringify({ ...good, seriousOutcome: 'none', timeLimitDays: null }), /inconsistent/],
    ['a non-complaint flagged as serious', JSON.stringify({ ...good, isComplaint: false }), /inconsistent/],
    ['a quote that is not in the complaint', JSON.stringify({ ...good, evidenceQuote: 'The patient died.' }), /exact passage/],
    ['a paraphrased quote', JSON.stringify({ ...good, evidenceQuote: 'the patient was moved to intensive care' }), /exact passage/],
  ])('rejects %s without repairing it', (_name, raw, message) => {
    const r = parseModelOutput(raw, text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(message);
  });
});

describe('DecisionInputSchema', () => {
  it('requires a reason for a correction', () => {
    const triage = { ...good, evidenceQuote: null };
    expect(DecisionInputSchema.safeParse({ action: 'correct', triage }).success).toBe(false);
    expect(DecisionInputSchema.safeParse({ action: 'correct', triage, reason: '   ' }).success).toBe(false);
    expect(DecisionInputSchema.safeParse({ action: 'correct', triage, reason: 'Not in the risk file, so 10 days.' }).success).toBe(true);
  });
  it('does not accept a reason or triage on a confirmation', () => {
    expect(DecisionInputSchema.safeParse({ action: 'confirm', reason: 'ok' }).success).toBe(false);
  });
});
