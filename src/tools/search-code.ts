/**
 * moyu - Search code tool
 * Uses ripgrep (rg) or fallback to PowerShell Select-String on Windows
 */

import { execSync } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import type { Tool, ToolResult, ToolContext } from './types.js';

export const searchCodeTool: Tool = {
  name: 'search_code',
  description: 'Search for text or patterns in the codebase. Uses ripgrep if available, otherwise falls back to built-in search.',
  permissionLevel: 'trusted',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Search pattern (plain text or regex)',
      },
      path: {
        type: 'string',
        description: 'Path to search in (defaults to working directory)',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 50)',
      },
    },
    required: ['pattern'],
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const pattern = String(args.pattern || '');
    const searchPath = args.path ? (isAbsolute(String(args.path)) ? String(args.path) : join(ctx.cwd, String(args.path))) : ctx.cwd;
    const maxResults = Number(args.maxResults) || 50;

    if (!pattern) {
      return { toolName: 'search_code', success: false, output: '', error: 'pattern is required' };
    }

    try {
      // Try ripgrep first
      try {
        const output = execSync(
          `rg -n --max-count ${maxResults} "${pattern.replace(/"/g, '\\"')}" "${searchPath}"`,
          { encoding: 'utf-8', maxBuffer: 1024 * 1024, timeout: 10000 }
        );
        const lines = output.trim().split('\n').slice(0, maxResults);
        return {
          toolName: 'search_code',
          success: true,
          output: lines.length > 0
            ? lines.join('\n')
            : `No results found for: ${pattern}`,
        };
      } catch {
        // Fallback: use PowerShell Select-String
        const output = execSync(
          `Get-ChildItem -Recurse -File "${searchPath}" | Select-String -Pattern "${pattern}" | Select-Object -First ${maxResults} | ForEach-Object { "$($_.Path):$($_.LineNumber):$($_.Line)" }`,
          { encoding: 'utf-8', shell: 'powershell', maxBuffer: 1024 * 1024, timeout: 15000 }
        );
        const lines = output.trim().split('\r\n').filter(l => l.trim()).slice(0, maxResults);
        return {
          toolName: 'search_code',
          success: true,
          output: lines.length > 0
            ? lines.join('\n')
            : `No results found for: ${pattern}`,
        };
      }
    } catch (e) {
      return {
        toolName: 'search_code',
        success: false,
        output: '',
        error: `Search failed: ${(e as Error).message}`,
      };
    }
  },
};

