/**
 * moyu - MCP (Model Context Protocol) support
 * Allows loading external tools from MCP servers.
 * 
 * MCP spec: https://modelcontextprotocol.io/
 * Communicates over stdio using JSON-RPC 2.0
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { Tool, ToolResult, ToolContext } from './types.js';
import type { MCPServerConfig } from '../config/types.js';
import type { ToolDefinition } from '../llm/types.js';

interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Manages connection to an MCP server process
 */
export class MCPServerClient {
  private process: ChildProcess | null = null;
  private rl: ReturnType<typeof createInterface> | null = null;
  private requestId = 0;
  private pending = new Map<number, { resolve: (v: MCPResponse) => void; reject: (e: Error) => void }>();
  private buffer = '';

  constructor(private config: MCPServerConfig) {}

  /** Start the MCP server process */
  async start(): Promise<void> {
    const [cmd, ...args] = this.config.command.split(' ');
    this.process = spawn(cmd, [...(this.config.args || []), ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.config.env },
    });

    this.rl = createInterface({ input: this.process.stdout! });
    this.rl.on('line', (line) => {
      try {
        const response = JSON.parse(line) as MCPResponse;
        const pending = this.pending.get(response.id);
        if (pending) {
          pending.resolve(response);
          this.pending.delete(response.id);
        }
      } catch {
        // Ignore non-JSON lines (e.g., server logs)
      }
    });

    this.process.stderr?.on('data', (data) => {
      // MCP servers may log to stderr
    });

    // Wait for process to start
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }

  /** Send a request and wait for response */
  private async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = ++this.requestId;
    const request: MCPRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (r) => {
          if (r.error) reject(new Error(r.error.message));
          else resolve(r.result);
        },
        reject,
      });
      this.process?.stdin?.write(JSON.stringify(request) + '\n');
    });
  }

  /** List available tools from this MCP server */
  async listTools(): Promise<ToolDefinition[]> {
    const result = await this.request('tools/list') as { tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> };
    return (result.tools || []).map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || {},
    }));
  }

  /** Call a tool on this MCP server */
  async callTool(name: string, args: Record<string, unknown>): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }> {
    const result = await this.request('tools/call', { name, arguments: args }) as { content: Array<{ type: string; text?: string }>; isError?: boolean };
    return result;
  }

  /** Stop the MCP server */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.rl?.close();
      this.rl = null;
    }
  }
}

/**
 * Create an MCP Tool wrapper that can be registered in the tool registry
 */
export function createMCPTool(serverName: string, def: ToolDefinition, client: MCPServerClient): Tool {
  return {
    name: def.name,
    description: `[MCP/${serverName}] ${def.description}`,
    permissionLevel: 'confirm',
    inputSchema: def.inputSchema as Record<string, unknown>,

    async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
      try {
        const result = await client.callTool(def.name, args);
        const text = result.content
          .filter(c => c.type === 'text')
          .map(c => c.text || '')
          .join('\n');
        return {
          toolName: def.name,
          success: !result.isError,
          output: text,
          error: result.isError ? text : undefined,
        };
      } catch (e) {
        return {
          toolName: def.name,
          success: false,
          output: '',
          error: `MCP tool error: ${(e as Error).message}`,
        };
      }
    },
  };
}
