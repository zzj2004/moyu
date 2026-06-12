/**
 * moyu - Write/Edit file tool
 * Generates a diff and asks for confirmation before applying changes.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, isAbsolute, dirname } from 'node:path';
import type { Tool, ToolResult, ToolContext } from './types.js';

export const writeFileTool: Tool = {
  name: 'write_file',
  description: 'Write or edit a file. Creates parent directories if needed. Always shows a diff before applying.',
  permissionLevel: 'confirm',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the file (relative to working directory or absolute)',
      },
      content: {
        type: 'string',
        description: 'New content to write to the file',
      },
    },
    required: ['filePath', 'content'],
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = String(args.filePath || '');
    const content = String(args.content || '');

    if (!filePath) {
      return { toolName: 'write_file', success: false, output: '', error: 'filePath is required' };
    }

    const resolvedPath = isAbsolute(filePath) ? filePath : join(ctx.cwd, filePath);
    const relPath = relative(ctx.cwd, resolvedPath);

    // If file exists, show diff
    let diffOutput = '';
    if (existsSync(resolvedPath)) {
      const oldContent = readFileSync(resolvedPath, 'utf-8');
      diffOutput = generateDiff(relPath, oldContent, content);
    } else {
      diffOutput = `[NEW FILE] ${relPath}`;
    }

    // Ask permission
    const action = `Write file ${relPath}\n${diffOutput}`;
    const allowed = await ctx.askPermission(action, 'write_file');
    if (!allowed) {
      return { toolName: 'write_file', success: false, output: '', error: 'Permission denied by user' };
    }

    try {
      // Create parent directory
      const parentDir = dirname(resolvedPath);
      if (!existsSync(parentDir)) {
        mkdirSync(parentDir, { recursive: true });
      }

      writeFileSync(resolvedPath, content, 'utf-8');
      return {
        toolName: 'write_file',
        success: true,
        output: `Written: ${relPath}\n${diffOutput}`,
      };
    } catch (e) {
      return {
        toolName: 'write_file',
        success: false,
        output: '',
        error: `Error writing file: ${(e as Error).message}`,
      };
    }
  },
};

function generateDiff(filePath: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const result: string[] = [];

  // Simple line-based diff (shows context around changes)
  let i = 0, j = 0;
  const hunks: Array<{ oldStart: number; newStart: number; lines: string[] }> = [];
  let currentHunk: typeof hunks[0] | null = null;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      if (currentHunk) {
        currentHunk.lines.push(`  ${oldLines[i]}`);
      }
      i++;
      j++;
    } else {
      if (!currentHunk) {
        currentHunk = { oldStart: i + 1, newStart: j + 1, lines: [] };
        hunks.push(currentHunk);
      }
      if (i < oldLines.length) {
        currentHunk.lines.push(`- ${oldLines[i]}`);
        i++;
      }
      if (j < newLines.length) {
        currentHunk.lines.push(`+ ${newLines[j]}`);
        j++;
      }
    }
  }

  result.push(`--- a/${filePath}`);
  result.push(`+++ b/${filePath}`);
  for (const hunk of hunks) {
    result.push(`@@ -${hunk.oldStart},... +${hunk.newStart},... @@`);
    result.push(...hunk.lines);
  }

  return result.join('\n');
}
