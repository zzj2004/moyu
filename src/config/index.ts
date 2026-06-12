/**
 * moyu - Configuration loader
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { MoyuConfig, PermissionLevel } from './types.js';

const CONFIG_DIR = join(homedir(), '.moyu');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: MoyuConfig = {
  llm: {
    provider: 'deepseek',
    apiKey: '',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    maxTokens: 16384,
    temperature: 0.3,
  },
  providerKeys: {},
  permissionMode: 'confirm',
};

export function loadConfig(): MoyuConfig {
  const config: MoyuConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  if (existsSync(CONFIG_FILE)) {
    try {
      let fileContent = readFileSync(CONFIG_FILE, 'utf-8');
      if (fileContent.charCodeAt(0) === 0xFEFF) fileContent = fileContent.slice(1);
      const userConfig = JSON.parse(fileContent) as Partial<MoyuConfig>;
      if (userConfig.llm) {
      Object.assign(config.llm, userConfig.llm);
      if (userConfig.providerKeys) {
        config.llm.providerKeys = { ...userConfig.providerKeys };
      }
    }
      if (userConfig.providerKeys) config.providerKeys = { ...userConfig.providerKeys };
      if (userConfig.permissionMode) config.permissionMode = userConfig.permissionMode;
      if (userConfig.mcpServers) config.mcpServers = userConfig.mcpServers;
      if (userConfig.systemPrompt) config.systemPrompt = userConfig.systemPrompt;
      if (userConfig.workDir) config.workDir = userConfig.workDir;
      if (userConfig.toolPermissions) config.toolPermissions = userConfig.toolPermissions;
    } catch (e) {
      console.error('Warning: Failed to parse config file:', CONFIG_FILE);
    }
  }

  // Env var overrides for current provider
  if (process.env.MOYU_API_KEY) config.llm.apiKey = process.env.MOYU_API_KEY;
  if (process.env.MOYU_BASE_URL) config.llm.baseUrl = process.env.MOYU_BASE_URL;
  if (process.env.MOYU_MODEL) config.llm.model = process.env.MOYU_MODEL;
  if (process.env.MOYU_PROVIDER) config.llm.provider = process.env.MOYU_PROVIDER;
  if (process.env.MOYU_PERMISSION_MODE) config.permissionMode = process.env.MOYU_PERMISSION_MODE as PermissionLevel;
  if (process.env.MOYU_MAX_TOKENS) config.llm.maxTokens = parseInt(process.env.MOYU_MAX_TOKENS);

  // Sync llm.providerKeys from top-level providerKeys
  if (!config.llm.providerKeys && config.providerKeys) {
    config.llm.providerKeys = { ...config.providerKeys };
  }

  // Per-provider env vars (e.g. MOYU_KIMI_API_KEY, MOYU_DEEPSEEK_API_KEY)
  if (!config.providerKeys) config.providerKeys = {};
  for (const key of Object.keys(process.env)) {
    const match = key.match(/^MOYU_([A-Z]+)_API_KEY$/);
    if (match) {
      config.providerKeys[match[1].toLowerCase()] = process.env[key]!;
    }
  }

  return config;
}

/** Get API key for a specific provider */
export function getProviderApiKey(config: MoyuConfig, providerName: string): string | undefined {
  // Check providerKeys map
  if (config.providerKeys?.[providerName]) return config.providerKeys[providerName];
  // Fall back to current active key
  if (config.llm.provider === providerName) return config.llm.apiKey;
  return undefined;
}

export function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function initConfig(): void {
  ensureConfigDir();
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    console.log('Created default config at:', CONFIG_FILE);
  }
}
