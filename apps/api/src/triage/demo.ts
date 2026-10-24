import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { ProviderError, type TriageProvider, type TriageRequest } from './provider.js';

export interface Recording {
  model: string;
  promptVersion: string;
  recordedAt: string;
  raw: string;
}

export type RecordingFile = Record<string, Recording>;

// Recordings are keyed by prompt version and the exact request, so a changed prompt or device text never replays a stale answer.
export const recordingKey = (promptVersion: string, request: TriageRequest) =>
  createHash('sha256').update(`${promptVersion}\n${request.system}\n${request.user}`).digest('hex');

// Replays responses recorded from the real model. It never calls the network and never invents an answer.
export class DemoProvider implements TriageProvider {
  readonly name = 'demo';
  readonly model: string;
  private readonly recordings: RecordingFile;

  constructor(path: string, private readonly promptVersion: string) {
    this.recordings = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as RecordingFile) : {};
    const models = new Set(Object.values(this.recordings).map((r) => r.model));
    this.model = models.size === 1 ? [...models][0]! : 'recorded';
  }

  async complete(request: TriageRequest): Promise<{ raw: string; model: string }> {
    const hit = this.recordings[recordingKey(this.promptVersion, request)];
    if (!hit) throw new ProviderError('Demo mode has no recorded model response for this text. Triage it by hand.');
    return { raw: hit.raw, model: hit.model };
  }
}
