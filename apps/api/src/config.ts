export type ProviderName = 'demo' | 'gemini';

export interface Config {
  port: number;
  mongoUri: string;
  dbName: string;
  provider: ProviderName;
  geminiModel: string;
  geminiApiKey: string | undefined;
  // In demo mode the clock is frozen so the seeded story and its deadlines stay the same for every visitor.
  fixedNow: string | undefined;
  corsOrigin: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const provider = (env.TRIAGE_PROVIDER ?? 'demo') as ProviderName;
  if (provider !== 'demo' && provider !== 'gemini') throw new Error(`TRIAGE_PROVIDER must be "demo" or "gemini", not "${provider}".`);
  if (provider === 'gemini' && !env.GEMINI_API_KEY) throw new Error('TRIAGE_PROVIDER=gemini needs GEMINI_API_KEY in .env.');
  return {
    port: Number(env.PORT ?? 4000),
    mongoUri: env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017',
    dbName: env.MONGODB_DB ?? 'playnt',
    provider,
    geminiModel: env.GEMINI_MODEL ?? 'gemini-3.8-flash',
    geminiApiKey: env.GEMINI_API_KEY,
    fixedNow: env.PLAYNT_NOW ?? (provider === 'demo' ? '2026-10-25T09:00:00.000Z' : undefined),
    corsOrigin: env.CORS_ORIGIN,
  };
}

export type Clock = () => Date;
export const clockFrom = (fixedNow: string | undefined): Clock => (fixedNow ? () => new Date(fixedNow) : () => new Date());
