/**
 * moyu - LLM type definitions
 */

export type MessageRole = 'system' | 'user' | 'assistant';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } };

export interface Message {
  role: MessageRole;
  content: string | ContentPart[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  stopReason?: 'end_turn' | 'tool_use' | 'max_tokens';
}

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ProviderInfo {
  name: string;
  displayName: string;
  baseUrl: string;
  models: string[];
  defaultModel: string;
  maxTokens: number;
  defaultTemperature?: number;
}

export interface ProviderCapabilities {
  supportsImages: boolean;
  supportsVideo: boolean;
  supportsThinking: boolean;
  supportsThinkingEffort: boolean;
  supportsWebSearch: boolean;
}

export const PROVIDER_CAPS: Record<string, ProviderCapabilities> = {
  deepseek: { supportsImages: false, supportsVideo: false, supportsThinking: false, supportsThinkingEffort: false, supportsWebSearch: false },
  kimi: { supportsImages: true, supportsVideo: true, supportsThinking: true, supportsThinkingEffort: false, supportsWebSearch: true },
};

export const MODEL_CAPS: Record<string, { supportsThinking: boolean; supportsThinkingEffort: boolean }> = {
  'deepseek-v4-pro': { supportsThinking: true, supportsThinkingEffort: true },
  'deepseek-v4-flash': { supportsThinking: true, supportsThinkingEffort: false },
  'deepseek-reasoner': { supportsThinking: true, supportsThinkingEffort: true },
  'kimi-k2.6': { supportsThinking: true, supportsThinkingEffort: false },
  'kimi-k2.5': { supportsThinking: true, supportsThinkingEffort: false },
};

export const BUILTIN_PROVIDERS: Record<string, ProviderInfo> = {
  deepseek: {
    name: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder', 'deepseek-v4-pro', 'deepseek-flash', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    maxTokens: 16384,
  },
  kimi: {
    name: 'kimi',
    displayName: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-k2.6', 'kimi-k2.5', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
    defaultModel: 'kimi-k2.6',
    maxTokens: 8192,
    defaultTemperature: 1,
  },
};

export interface LLMProvider {
  readonly name: string;
  readonly displayName: string;
  model: string;
  readonly availableModels: string[];
  readonly maxTokens: number;
  setModel(model: string): void;
  chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse>;
  chatStream(messages: Message[], tools: ToolDefinition[] | undefined, callbacks: StreamCallbacks): Promise<LLMResponse>;
  isConfigured(): boolean;
}

