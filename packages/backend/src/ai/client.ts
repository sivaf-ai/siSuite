/** client.ts — client Anthropic (SDK ufficiale). Singleton lazy. */
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!config.ai.apiKey) throw new Error('ANTHROPIC_API_KEY non configurata');
  if (!client) client = new Anthropic({ apiKey: config.ai.apiKey });
  return client;
}
