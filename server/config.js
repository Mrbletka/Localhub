// Local settings live in <data>/.localhub/config.json (git-ignored, readable only by you).
import fs from 'node:fs';
import path from 'node:path';

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (recommended)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (faster, cheaper)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (cheapest)' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1 (most capable, premium)' },
];
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

const DEFAULTS = {
  apiKey: '',
  model: 'claude-opus-5-5',
  specialistModel: '',
  effort: { director: 'high', specialists: 'medium' },
  features: { fallbacks: true, progressUpdates: true, compaction: true },
  minecraftDir: '',
  author: '',
  studioName: 'My Bedrock Studio',
  studioUrl: '',
};

export class Config {
  constructor(dataDir) {
    this.dir = path.join(dataDir, '.localhub');
    this.file = path.join(this.dir, 'config.json');
    fs.mkdirSync(this.dir, { recursive: true });
    let stored = {};
    try {
      stored = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      // first run
    }
    this.data = {
      ...DEFAULTS,
      ...stored,
      effort: { ...DEFAULTS.effort, ...(stored.effort || {}) },
      features: { ...DEFAULTS.features, ...(stored.features || {}) },
    };
  }

  get(key) {
    return this.data[key];
  }

  /** API key from settings, else the environment (the SDK also reads ANTHROPIC_API_KEY itself). */
  get apiKey() {
    return this.data.apiKey || process.env.ANTHROPIC_API_KEY || '';
  }

  update(patch) {
    const next = { ...this.data };
    for (const key of Object.keys(DEFAULTS)) {
      if (patch[key] === undefined) continue;
      if (key === 'effort' || key === 'features') next[key] = { ...next[key], ...patch[key] };
      else next[key] = patch[key];
    }
    if (!MODELS.some((m) => m.id === next.model)) next.model = DEFAULTS.model;
    if (next.specialistModel && !MODELS.some((m) => m.id === next.specialistModel)) next.specialistModel = '';
    for (const k of Object.keys(next.effort)) if (!EFFORTS.includes(next.effort[k])) next.effort[k] = DEFAULTS.effort[k] || 'medium';
    this.data = next;
    fs.writeFileSync(this.file, JSON.stringify(next, null, 2), { mode: 0o600 });
    return this.publicView();
  }

  publicView() {
    const key = this.apiKey;
    const { apiKey, ...rest } = this.data;
    return {
      ...rest,
      apiKeySet: Boolean(key),
      apiKeySource: apiKey ? 'settings' : process.env.ANTHROPIC_API_KEY ? 'environment' : 'none',
      apiKeyHint: key ? `${key.slice(0, 7)}...${key.slice(-4)}` : '',
      models: MODELS,
      efforts: EFFORTS,
    };
  }
}
