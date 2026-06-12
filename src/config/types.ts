/**
 * moyu - Configuration type definitions
 */

export type PermissionLevel = 'confirm' | 'trusted';

export interface LLMConfig {
  provider: 'deepseek' | 'kimi' | 'openai' | string;
  apiKey: string;
  baseUrl?: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max';
}

export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ToolPermission {
  toolName: string;
  level: PermissionLevel;
}

export interface MoyuConfig {
  llm: LLMConfig;
  /** API keys for additional providers: { "kimi": "sk-...", "openai": "sk-..." } */
  providerKeys?: Record<string, string>;
  permissionMode: PermissionLevel;
  toolPermissions?: ToolPermission[];
  mcpServers?: MCPServerConfig[];
  systemPrompt?: string;
  workDir?: string;
}
