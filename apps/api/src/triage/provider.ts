// One model behind one interface. The provider returns raw text; parsing and validation happen elsewhere,
// so every provider is held to the same strict rules.
export interface TriageRequest {
  system: string;
  user: string;
  complaintText: string;
}

export interface TriageProvider {
  readonly name: string;
  readonly model: string;
  complete(request: TriageRequest): Promise<{ raw: string; model: string }>;
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}
