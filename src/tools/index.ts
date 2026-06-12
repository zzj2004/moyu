/**
 * moyu - Tool registry
 * Manages all available tools (built-in + MCP)
 */

import type { Tool, ToolResult, ToolContext } from './types.js';
import type { ToolDefinition } from '../llm/types.js';
import { readFileTool } from './read-file.js';
import { writeFileTool } from './write-file.js';
import { searchCodeTool } from './search-code.js';
import { runCommandTool } from './run-command.js';
import { listDirTool } from './list-dir.js';
import { deleteFileTool } from './file-delete.js';
import { renameFileTool } from './file-rename.js';
import { gitStatusTool, gitDiffTool, gitLogTool, gitCommitTool } from './git.js';
import { MCPServerClient, createMCPTool } from './mcp.js';
import type { MCPServerConfig } from '../config/types.js';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private mcpClients: MCPServerClient[] = [];

  constructor() {
    this.registerBuiltinTools();
  }

  private registerBuiltinTools(): void {
    this.tools.set(readFileTool.name, readFileTool);
    this.tools.set(writeFileTool.name, writeFileTool);
    this.tools.set(searchCodeTool.name, searchCodeTool);
    this.tools.set(runCommandTool.name, runCommandTool);
    this.tools.set(listDirTool.name, listDirTool);
    this.tools.set(deleteFileTool.name, deleteFileTool);
    this.tools.set(renameFileTool.name, renameFileTool);
    this.tools.set(gitStatusTool.name, gitStatusTool);
    this.tools.set(gitDiffTool.name, gitDiffTool);
    this.tools.set(gitLogTool.name, gitLogTool);
    this.tools.set(gitCommitTool.name, gitCommitTool);
  }

  /** Initialize MCP servers */
  async initMCPServers(servers: MCPServerConfig[] = []): Promise<void> {
    for (const serverConfig of servers) {
      try {
        const client = new MCPServerClient(serverConfig);
        await client.start();
        this.mcpClients.push(client);

        const mcpTools = await client.listTools();
        for (const toolDef of mcpTools) {
          const mcpTool = createMCPTool(serverConfig.name, toolDef, client);
          this.tools.set(mcpTool.name, mcpTool);
        }
        console.log(`MCP server "${serverConfig.name}" connected with ${mcpTools.length} tool(s)`);
      } catch (e) {
        console.error(`Failed to start MCP server "${serverConfig.name}": ${(e as Error).message}`);
      }
    }
  }

  /** Get all tool definitions for LLM function calling */
  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  /** Get a tool by name */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /** Execute a tool by name */
  async executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { toolName: name, success: false, output: '', error: `Unknown tool: ${name}` };
    }
    return tool.execute(args, ctx);
  }

  /** Clean up MCP connections */
  cleanup(): void {
    for (const client of this.mcpClients) {
      client.stop();
    }
    this.mcpClients = [];
  }
}
