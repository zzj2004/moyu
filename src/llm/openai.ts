/**
 * moyu - OpenAI-compatible LLM provider with streaming
 * Works with DeepSeek, Kimi (Moonshot), OpenAI, etc.
 */

import type { LLMProvider, Message, LLMResponse, ToolDefinition, ToolCall, StreamCallbacks, ContentPart } from './types.js';
import { MODEL_CAPS, PROVIDER_CAPS } from './types.js';

type ChatContent = string | Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }>;
interface ChatMessage { role: string; content: ChatContent; }
interface ToolCallData { id: string; type: 'function'; function: { name: string; arguments: string }; }

export interface OpenAIProviderConfig {
  name: string;
  displayName: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  availableModels: string[];
  maxTokens: number;
  temperature?: number;
  defaultTemperature?: number;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'max';
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly displayName: string;
  readonly availableModels: string[];
  readonly maxTokens: number;
  private _model: string;
  private apiKey: string;
  private baseUrl: string;
  private temperature: number;
  private _reasoningOn = false;
  private _reasoningEffort: string | undefined;
  private _webSearchOn = false;

  constructor(config: OpenAIProviderConfig) {
    this.name = config.name;
    this.displayName = config.displayName;
    this._model = config.model;
    this.availableModels = [...config.availableModels];
    this.maxTokens = config.maxTokens;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.temperature = config.temperature ?? config.defaultTemperature ?? 0.3;
    this._reasoningEffort = config.reasoningEffort;
  }

  get model(): string { return this._model; }
  set model(val: string) { if (this.availableModels.includes(val)) this._model = val; }

  get thinkingOn(): boolean { return this._reasoningOn; }

  set reasoningEffort(val: string | undefined) { this._reasoningEffort = val; }

  /** Toggle thinking mode for supported models */
  setThinking(on: boolean): void {
    this._reasoningOn = on;
  }

  get webSearchOn(): boolean { return this._webSearchOn; }

  setWebSearch(on: boolean): void {
    this._webSearchOn = on;
  }

  setModel(model: string): void {
    if (this.availableModels.includes(model)) this._model = model;
    else { console.warn?.('Model not in available list, keeping ' + this._model); }
  }

  isConfigured(): boolean { return !!this.apiKey; }

  // Non-streaming chat
  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    if (!this.isConfigured()) throw new Error(`${this.displayName} API key not configured.`);

    const body = this.buildBody(messages, tools, false);
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${this.displayName} API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as any;
    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content || '',
      toolCalls: choice?.message?.tool_calls?.map((tc: any) => ({
        id: tc.id, type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
            stopReason: this.mapFinishReason(choice?.finish_reason),
      usage: data.usage ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens, totalTokens: data.usage.total_tokens } : undefined,
    };
  }

  // Streaming chat
  async chatStream(
    messages: Message[],
    tools: ToolDefinition[] | undefined,
    callbacks: StreamCallbacks
  ): Promise<LLMResponse> {
    if (!this.isConfigured()) throw new Error(`${this.displayName} API key not configured.`);

    const body = this.buildBody(messages, tools, true);
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${this.displayName} API error (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let toolCalls: ToolCall[] = [];
    let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';

    // Accumulators for streaming tool calls (keyed by index)
    const toolCallAccumulators: Record<number, {
      id?: string; type?: string; name?: string; args: string;
    }> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const payload = trimmed.slice(6).trim();
        if (payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta || {};
          const finish = parsed.choices?.[0]?.finish_reason;

          // Handle text content
          if (delta.content) {
            fullContent += delta.content;
            callbacks.onText?.(delta.content);
          }

          // Handle tool calls in streaming
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallAccumulators[idx]) {
                toolCallAccumulators[idx] = { args: '' };
              }
              const acc = toolCallAccumulators[idx];
              if (tc.id) acc.id = tc.id;
              if (tc.type) acc.type = tc.type;
              if (tc.function?.name) acc.name = (acc.name || '') + tc.function.name;
              if (tc.function?.arguments) acc.args += tc.function.arguments;
            }
          }

          // Handle finish reason
          if (finish === 'tool_calls') {
            stopReason = 'tool_use';
            // Finalize accumulated tool calls
            toolCalls = Object.values(toolCallAccumulators)
              .filter(acc => acc.id && acc.name)
              .map(acc => ({
                id: acc.id!,
                type: 'function' as const,
                function: { name: acc.name!, arguments: acc.args },
              }));
            for (const tc of toolCalls) {
              callbacks.onToolCall?.(tc);
            }
          } else if (finish === 'stop') {
            stopReason = 'end_turn';
          } else if (finish === 'length') {
            stopReason = 'max_tokens';
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

        // Check final buffer for usage data (last chunk before [DONE])
    let finalUsage = undefined;
    try {
      const lastLine = buffer.trim().split('\n').pop() || "";
      if (lastLine.startsWith('data: ') && !lastLine.includes('[DONE]')) {
        const lastData = JSON.parse(lastLine.slice(6));
        if (lastData.usage) {
          finalUsage = { promptTokens: lastData.usage.prompt_tokens, completionTokens: lastData.usage.completion_tokens, totalTokens: lastData.usage.total_tokens };
          callbacks.onUsage?.(finalUsage);
        }
      }
    } catch {}
    return { content: fullContent, toolCalls: toolCalls.length > 0 ? toolCalls : undefined, stopReason, usage: finalUsage /* streaming usage captured via onUsage callback */ };
  }

  private formatMessages(messages: Message[]): ChatMessage[] {
    return messages.map(m => {
      // Build the chat message
      const chatMsg: Record<string, unknown> = { role: m.role };

      // Handle content
      if (typeof m.content === 'string') {
        chatMsg.content = m.content;
      } else if (Array.isArray(m.content)) {
        const parts = m.content.map(part => {
          if (part.type === 'text') {
            return { type: 'text', text: part.text };
          }
          if (part.type === 'image_url') {
            return {
              type: 'image_url',
              image_url: {
                url: part.image_url.url,
                detail: part.image_url.detail || 'auto',
              },
            };
          }
          return { type: 'text', text: '' };
        });
        chatMsg.content = parts;
      }

      // Tool call response
      if (m.tool_call_id) {
        chatMsg.tool_call_id = m.tool_call_id;
      }

      // Assistant tool calls
      if (m.tool_calls && m.tool_calls.length > 0) {
        chatMsg.tool_calls = m.tool_calls.map(tc => ({
          id: tc.id,
          type: tc.type,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        }));
        // Kimi thinking models require reasoning_content for tool call messages
        chatMsg.reasoning_content = '';
      }

      return chatMsg as unknown as ChatMessage;
    });
  }

    private buildBody(messages: Message[], tools?: ToolDefinition[], stream?: boolean): Record<string, unknown> {
    const chatMessages = this.formatMessages(messages);
    const body: Record<string, unknown> = {
      model: this._model,
      messages: chatMessages,
      max_tokens: this.maxTokens,
      stream: stream ?? false,
    };
    const bodyTools: unknown[] = [];

    // Add reasoning_effort for thinking models
    const modelCaps = MODEL_CAPS[this._model];
    if (this._reasoningOn && modelCaps?.supportsThinkingEffort) {
      body.reasoning_effort = this._reasoningEffort || 'high';
    }

    // Enable web search builtin (Kimi only: uses builtin_function $web_search)
    if (this._webSearchOn && PROVIDER_CAPS[this.name]?.supportsWebSearch) {
      bodyTools.push({
        type: 'builtin_function',
        function: { name: '$web_search' },
      });
    }

    // Add regular function tools alongside web_search
    if (tools && tools.length > 0) {
      for (const t of tools) {
        bodyTools.push({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        });
      }
    }

    if (bodyTools.length > 0) {
      body.tools = bodyTools;
    }

    return body;
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  private mapFinishReason(reason: string): 'end_turn' | 'tool_use' | 'max_tokens' {
    switch (reason) {
      case 'stop': return 'end_turn';
      case 'tool_calls': return 'tool_use';
      case 'length': return 'max_tokens';
      default: return 'end_turn';
    }
  }
}

