/**
 * moyu - Tool type definitions
 */

import type { PermissionLevel } from '../config/types.js';

/** Tool result */
export interface ToolResult {
  toolName: string;
  success: boolean;
  output: string;
  error?: string;
}

/** Tool execution context */
export interface ToolContext {
  /** Current working directory */
  cwd: string;
  /** Permission mode */
  permissionMode: PermissionLevel;
  /** Ask user for permission (returns true if allowed) */
  askPermission(action: string, toolName: string): Promise<boolean>;
}

/** Tool definition */
export interface Tool {
  /** Tool name (used by LLM) */
  name: string;
  /** Description for the LLM */
  description: string;
  /** JSON Schema for tool arguments */
  inputSchema: Record<string, unknown>;
  /** Default permission level for this tool */
  permissionLevel: PermissionLevel;
  /** Execute the tool */
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
