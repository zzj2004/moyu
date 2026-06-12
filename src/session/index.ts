/**
 * moyu - Session history: project-level + global dual-path storage
 *
 * Project-level:  {cwd}/.moyu/sessions/  — per-project conversation history
 * Global:         ~/.moyu/sessions/       — all sessions backup + crash recovery
 *
 * Auto-save after every interaction, auto-detect on startup.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';
import type { Message } from '../llm/types.js';

export interface SessionData {
  version: number;
  createdAt: string;
  updatedAt: string;
  projectDir: string;
  sessionId: string;
  provider: string;
  model: string;
  permissionMode: string;
  messages: Message[];
}

const GLOBAL_DIR = join(homedir(), '.moyu', 'sessions');

/** Get project session dir */
function getProjectDir(cwd: string): string {
  return join(cwd, '.moyu', 'sessions');
}

/** Ensure both dirs exist */
function ensureDirs(cwd: string): { global: string; project: string } {
  const project = getProjectDir(cwd);
  if (!existsSync(GLOBAL_DIR)) mkdirSync(GLOBAL_DIR, { recursive: true });
  if (!existsSync(project)) mkdirSync(project, { recursive: true });
  return { global: GLOBAL_DIR, project };
}

/** Generate a session ID from timestamp */
function generateSessionId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/** Get the latest session file in a directory */
function getLatestSession(dir: string): SessionData | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  try {
    return JSON.parse(readFileSync(join(dir, files[0]), 'utf-8'));
  } catch {
    return null;
  }
}

/** Save session to both project dir and global dir */
export function saveSession(
  cwd: string,
  sessionId: string,
  data: Omit<SessionData, 'version' | 'createdAt' | 'updatedAt'>
): void {
  const dirs = ensureDirs(cwd);

  const existingProject = getSessionById(cwd, sessionId);
  const existingGlobal = getSessionByIdGlobal(sessionId);

  const session: SessionData = {
    version: 1,
    createdAt: existingProject?.createdAt || existingGlobal?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...data,
    sessionId,
  };

  // Save to project dir
  const projectFile = join(dirs.project, sessionId + '.json');
  writeFileSync(projectFile, JSON.stringify(session, null, 2), 'utf-8');

  // Save to global dir (backup)
  const globalFile = join(dirs.global, sessionId + '.json');
  writeFileSync(globalFile, JSON.stringify(session, null, 2), 'utf-8');
}

/** Auto-save current session (called after each interaction) */
export function autoSave(cwd: string, sessionId: string, data: Omit<SessionData, 'version' | 'createdAt' | 'updatedAt'>): void {
  saveSession(cwd, sessionId, data);
}

/** Find session by ID in project dir */
function getSessionById(cwd: string, sessionId: string): SessionData | null {
  const project = getProjectDir(cwd);
  const filePath = join(project, sessionId + '.json');
  if (!existsSync(filePath)) return null;
  try { return JSON.parse(readFileSync(filePath, 'utf-8')); } catch { return null; }
}

/** Find session by ID globally */
function getSessionByIdGlobal(sessionId: string): SessionData | null {
  const filePath = join(GLOBAL_DIR, sessionId + '.json');
  if (!existsSync(filePath)) return null;
  try { return JSON.parse(readFileSync(filePath, 'utf-8')); } catch { return null; }
}

/** Load the latest session for a project directory */
export function loadLatestSession(cwd: string): SessionData | null {
  // Try project dir first
  const project = getProjectDir(cwd);
  const latest = getLatestSession(project);
  if (latest) return latest;

  // Fall back to global dir
  return getLatestSession(GLOBAL_DIR);
}

/** Load a specific session by ID */
export function loadSession(cwd: string, sessionId: string): SessionData | null {
  const project = getProjectDir(cwd);
  const filePath = join(project, sessionId + '.json');
  if (existsSync(filePath)) {
    try { return JSON.parse(readFileSync(filePath, 'utf-8')); } catch {}
  }
  // Fallback to global
  const globalPath = join(GLOBAL_DIR, sessionId + '.json');
  if (existsSync(globalPath)) {
    try { return JSON.parse(readFileSync(globalPath, 'utf-8')); } catch {}
  }
  return null;
}

/** List sessions for current project */
export function listSessions(cwd: string): { sessionId: string; createdAt: string; messageCount: number; provider: string }[] {
  const dirs = ensureDirs(cwd);
  const seen = new Set<string>();
  const result: { sessionId: string; createdAt: string; messageCount: number; provider: string }[] = [];

  // Project sessions first
  if (existsSync(dirs.project)) {
    const files = readdirSync(dirs.project).filter(f => f.endsWith('.json')).sort().reverse();
    for (const f of files) {
      const id = f.replace('.json', '');
      if (seen.has(id)) continue;
      seen.add(id);
      try {
        const data = JSON.parse(readFileSync(join(dirs.project, f), 'utf-8'));
        result.push({
          sessionId: id,
          createdAt: data.createdAt || '',
          messageCount: (data.messages || []).length,
          provider: data.provider || '?',
        });
      } catch {}
    }
  }

  return result;
}

/** Delete a session */
export function deleteSession(cwd: string, sessionId: string): boolean {
  const dirs = ensureDirs(cwd);
  let deleted = false;
  const projectFile = join(dirs.project, sessionId + '.json');
  if (existsSync(projectFile)) { unlinkSync(projectFile); deleted = true; }
  const globalFile = join(dirs.global, sessionId + '.json');
  if (existsSync(globalFile)) { unlinkSync(globalFile); deleted = true; }
  return deleted;
}

/** Check if a project has an existing session to resume */
export function hasResumableSession(cwd: string): boolean {
  return loadLatestSession(cwd) !== null;
}
