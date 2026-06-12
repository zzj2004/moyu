/**
 * moyu - Rename/move file tool
 */

import { renameSync, existsSync } from 'node:fs';
import { join, relative, isAbsolute, dirname } from 'node:path';
import type { Tool, ToolResult, ToolContext } from './types.js';

export const renameFileTool: Tool = {
  name: 'file_rename',
  description: 'Rename or move a file/directory to a new path.',
  permissionLevel: 'confirm',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', description: 'Current path of the file/directory' },
      dest: { type: 'string', description: 'New path' },
    },
    required: ['source', 'dest'],
  },

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const src = String(args.source || '');
    const dst = String(args.dest || '');

    if (!src || !dst) return { toolName: 'file_rename', success: false, output: '', error: 'source and dest are required' };

    const srcPath = isAbsolute(src) ? src : join(ctx.cwd, src);
    const dstPath = isAbsolute(dst) ? dst : join(ctx.cwd, dst);
    const relSrc = relative(ctx.cwd, srcPath);
    const relDst = relative(ctx.cwd, dstPath);

    if (!existsSync(srcPath)) {
      return { toolName: 'file_rename', success: false, output: '', error: 'Source not found: ' + src };
    }

    if (existsSync(dstPath)) {
      return { toolName: 'file_rename', success: false, output: '', error: 'Destination already exists: ' + dst };
    }

    const action = 'Rename/Move:\n  From: ' + relSrc + '\n  To:   ' + relDst;
    const allowed = await ctx.askPermission(action, 'file_rename');
    if (!allowed) return { toolName: 'file_rename', success: false, output: '', error: 'Permission denied' };

    try {
      renameSync(srcPath, dstPath);
      return { toolName: 'file_rename', success: true, output: 'Renamed: ' + relSrc + ' -> ' + relDst };
    } catch (e) {
      return { toolName: 'file_rename', success: false, output: '', error: 'Rename failed: ' + (e as Error).message };
    }
  },
};
