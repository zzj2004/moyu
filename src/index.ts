#!/usr/bin/env node

/**
 * moyu - Terminal AI Coding Agent
 * MIT License
 *
 * Entry point: starts the CLI
 */

import { runCLI } from './cli/index.js';

runCLI().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
