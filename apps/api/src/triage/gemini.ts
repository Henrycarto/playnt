import { ProviderError, type TriageProvider, type TriageRequest } from './provider.js';

// Response schema in the Gemini (OpenAPI subset) format. The server validates again with Zod; this only steers the model.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isComplaint: { type: 'BOOLEAN' },
    possibleSeriousIncident: { type: 'BOOLEAN' },
    seriousOutcome: {
      type: 'STRING',
      enum: ['public_health_threat', 'death', 'serious_deterioration_unanticipated', 'serious_deterioration_anticipated', 'might_have_led', 'none'],
    },
    timeLimitDays: { type: 'INTEGER', nullable: true },
    problemDescription: { type: 'STRING' },
    evidenceQuote: { type: 'STRING' },
    rationale: { type: 'STRING' },
  },
  required: ['isComplaint', 'possibleSeriousIncident', 'seriousOutcome', 'timeLimitDays', 'problemDescription', 'evidenceQuote', 'rationale'],
  propertyOrdering: ['isComplaint', 'possibleSeriousIncident', 'seriousOutcome', 'timeLimitDays', 'problemDescription', 'evidenceQuote', 'rationale'],
};

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

export class GeminiProvider implements TriageProvider {
  readonly name = 'gemini';
  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async complete(request: TriageRequest): Promise<{ raw: string; model: string }> {
    // Only the complaint text and the fictional device's risk file are sent. No reporter details.
    const body = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: 'user', parts: [{ text: request.user }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    let last = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      if (RETRY_STATUS.has(res.status)) {
        last = `HTTP ${res.status}`;
        await this.sleep(Math.min(30_000, 1000 * 2 ** attempt));
        continue;
      }
      if (!res.ok) throw new ProviderError(`Gemini returned HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return { raw: (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join(''), model: this.model };
    }
    throw new ProviderError(`Gemini unavailable after retries (${last}).`);
  }
}
