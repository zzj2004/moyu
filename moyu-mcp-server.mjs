#!/usr/bin/env node

/**
 * moyu MCP File Reader Server
 * 
 * Provides enhanced file reading tools:
 * - read_file_with_lines: Read file with line numbers
 * - read_file_head: Read first N lines
 * - read_file_tail: Read last N lines
 */

import { readFileSync, statSync, existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin });
let buffer = '';

rl.on('line', (line) => {
  buffer += line;
  try {
    const request = JSON.parse(buffer);
    buffer = '';
    handleRequest(request).then((response) => {
      process.stdout.write(JSON.stringify(response) + '\n');
    });
  } catch {
    // Incomplete JSON, keep buffering
  }
});

async function handleRequest(request) {
  const { id, method, params } = request;

  switch (method) {
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: getToolDefinitions() } };

    case 'tools/call':
      return { jsonrpc: '2.0', id, result: await callTool(params.name, params.arguments || {}) };

    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
  }
}

function getToolDefinitions() {
  return [
    {
      name: 'read_file_with_lines',
      description: 'Read a file with line numbers displayed. Good for referencing specific lines.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to read' },
          startLine: { type: 'number', description: 'Start from line number (1-based, default: 1)' },
          lineCount: { type: 'number', description: 'Number of lines to show (default: all)' },
        },
        required: ['path'],
      },
    },
    {
      name: 'read_file_head',
      description: 'Read the first N lines of a file. Useful for quickly checking file headers or structure.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to read' },
          lines: { type: 'number', description: 'Number of lines to show (default: 20)' },
        },
        required: ['path'],
      },
    },
    {
      name: 'read_file_tail',
      description: 'Read the last N lines of a file. Useful for checking recent changes or log files.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to read' },
          lines: { type: 'number', description: 'Number of lines to show (default: 20)' },
        },
        required: ['path'],
      },
    },
  ];
}

async function callTool(name, args) {
  try {
    switch (name) {
      case 'read_file_with_lines':
        return readWithLines(args);
      case 'read_file_head':
        return readHead(args);
      case 'read_file_tail':
        return readTail(args);
      default:
        return { content: [{ type: 'text', text: 'Unknown tool: ' + name }], isError: true };
    }
  } catch (e) {
    return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
  }
}

function getFullPath(filePath) {
  // If relative, resolve from cwd
  if (!isAbsolute(filePath)) {
    return resolve(process.cwd(), filePath);
  }
  return filePath;
}

function readWithLines(args) {
  const filePath = getFullPath(args.path);
  if (!existsSync(filePath)) {
    return { content: [{ type: 'text', text: 'File not found: ' + args.path }], isError: true };
  }

  const content = readFileSync(filePath, 'utf-8');
  const allLines = content.split('\n');
  const startLine = (args.startLine || 1) - 1;
  const lineCount = args.lineCount || allLines.length;
  const lines = allLines.slice(startLine, startLine + lineCount);

  // Calculate padding for line numbers
  const maxLineNum = startLine + lines.length;
  const padding = String(maxLineNum).length;

  const result = lines.map((line, i) => {
    const lineNum = startLine + i + 1;
    const num = String(lineNum).padStart(padding);
    return `${num} | ${line}`;
  }).join('\n');

  const stat = statSync(filePath);
  const header = [
    `File: ${filePath}`,
    `Size: ${(stat.size / 1024).toFixed(1)} KB`,
    `Lines: ${allLines.length}`,
    `Showing: lines ${startLine + 1}-${startLine + lines.length}`,
    '',
  ].join('\n');

  return { content: [{ type: 'text', text: header + '\n' + result }] };
}

function readHead(args) {
  const filePath = getFullPath(args.path);
  if (!existsSync(filePath)) {
    return { content: [{ type: 'text', text: 'File not found: ' + args.path }], isError: true };
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const count = Math.min(args.lines || 20, lines.length);
  const head = lines.slice(0, count);

  const result = head.map((line, i) => {
    return `${i + 1} | ${line}`;
  }).join('\n');

  return {
    content: [{
      type: 'text',
      text: `File: ${filePath} (first ${count} of ${lines.length} lines)\n\n${result}`,
    }],
  };
}

function readTail(args) {
  const filePath = getFullPath(args.path);
  if (!existsSync(filePath)) {
    return { content: [{ type: 'text', text: 'File not found: ' + args.path }], isError: true };
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const count = Math.min(args.lines || 20, lines.length);
  const tail = lines.slice(-count);

  const result = tail.map((line, i) => {
    const lineNum = lines.length - count + i + 1;
    return `${lineNum} | ${line}`;
  }).join('\n');

  return {
    content: [{
      type: 'text',
      text: `File: ${filePath} (last ${count} of ${lines.length} lines)\n\n${result}`,
    }],
  };
}
