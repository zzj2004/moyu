/**
 * moyu - LLM provider factory
 */

import type { LLMConfig } from '../config/types.js';
import type { LLMProvider, ProviderInfo } from './types.js';
import { BUILTIN_PROVIDERS } from './types.js';
import { OpenAICompatibleProvider } from './openai.js';

/** Get provider info or fall back to a generic one */
function getProviderInfo(name: string, config: LLMConfig): ProviderInfo {
  const builtin = BUILTIN_PROVIDERS[name];
  if (builtin) return builtin;
  return {
    name,
    displayName: name,
    baseUrl: config.baseUrl || 'https://api.openai.com/v1',
    models: [config.model || 'gpt-4o'],
    defaultModel: config.model || 'gpt-4o',
    maxTokens: config.maxTokens || 4096,
  };
}

/** Create an LLM provider */
export function createLLM(config: LLMConfig): LLMProvider {
  const info = getProviderInfo(config.provider, config);

  // Use provider-specific API key if available in providerKeys map
  const apiKey = (config.providerKeys && config.providerKeys[config.provider]) || config.apiKey;

  return new OpenAICompatibleProvider({
    name: info.name,
    displayName: info.displayName,
    apiKey,
    baseUrl: info.baseUrl,  // Use builtin provider's baseUrl for known providers
    model: config.model || info.defaultModel,
    availableModels: info.models,
    maxTokens: config.maxTokens || info.maxTokens,
    temperature: config.temperature,
    defaultTemperature: info.defaultTemperature,
    reasoningEffort: config.reasoningEffort,
  });
}

/** List all known provider names */
export function listProviders(): string[] {
  return Object.keys(BUILTIN_PROVIDERS);
}

/** Get provider info by name */
export function getProviderInfoByName(name: string): ProviderInfo | undefined {
  return BUILTIN_PROVIDERS[name];
}
