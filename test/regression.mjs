/**
 * moyu regression test suite
 * Run with: node test/regression.mjs
 */

import { createLLM, listProviders } from "../dist/llm/index.js";
import { loadConfig, getProviderApiKey } from "../dist/config/index.js";
import { ToolRegistry } from "../dist/tools/index.js";
import { saveSession, loadLatestSession, listSessions, deleteSession } from "../dist/session/index.js";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

let passed = 0;
let failed = 0;
const errors = [];

async function assert(label, fn) {
  try {
    const result = await fn();
    if (result === true) {
      passed++;
      process.stdout.write(".");
    } else {
      failed++;
      errors.push(label + ": returned " + JSON.stringify(result));
      process.stdout.write("F");
    }
  } catch (e) {
    failed++;
    errors.push(label + ": threw " + e.message);
    process.stdout.write("E");
  }
}

console.log("moyu regression test suite");

async function runAll() {
  // ====== 1. Config ======
  await assert("loadConfig returns valid config", () => {
    const c = loadConfig();
    return !!c.llm && !!c.llm.apiKey;
  });

  await assert("getProviderApiKey finds kimi key", () => {
    const c = loadConfig();
    return !!getProviderApiKey(c, "kimi");
  });

  await assert("BUILTIN_PROVIDERS has 4 providers", () => {
    const p = listProviders();
    return p.length === 4 && p.includes("deepseek") && p.includes("kimi") && p.includes("openai") && p.includes("ollama");
  });

  // ====== 2. LLM Provider ======
  await assert("createLLM with deepseek", () => {
    const c = loadConfig();
    const llm = createLLM(c.llm);
    return llm.name === "deepseek" && llm.model.length > 0;
  });

  await assert("setModel rejects nonexistent", () => {
    const c = loadConfig();
    const llm = createLLM(c.llm);
    const old = llm.model;
    llm.setModel("NONEXISTENT_MODEL_FOR_TESTING_12345");
    return llm.model === old;
  });

  await assert("setModel accepts valid", () => {
    const c = loadConfig();
    const llm = createLLM(c.llm);
    llm.setModel("deepseek-coder");
    return llm.model === "deepseek-coder";
  });

  // ====== 3. Tools ======
  const registry = new ToolRegistry();
  const toolCtx = { cwd: process.cwd(), permissionMode: "trusted", askPermission: async () => true };

  await assert("11+ built-in tools", () => {
    const defs = registry.getToolDefinitions();
    return defs.length >= 11;
  });

  await assert("read_file with filePath", async () => {
    const r = await registry.executeTool("read_file", { filePath: "package.json" }, toolCtx);
    return r.success && r.output.includes("moyu-agent");
  });

  await assert("read_file fails without filePath", async () => {
    const r = await registry.executeTool("read_file", {}, toolCtx);
    return !r.success && r.error.includes("filePath");
  });

  await assert("write_file creates new file", async () => {
    const r = await registry.executeTool("write_file", { filePath: "_test_regression.tmp", content: "test" }, toolCtx);
    return r.success && r.output.includes("[NEW FILE]");
  });

  // Clean up
  try { unlinkSync("_test_regression.tmp"); } catch {}

  await assert("file_delete with filePath", async () => {
    const r = await registry.executeTool("file_delete", { filePath: "_nonexistent_12345.tmp" }, toolCtx);
    return !r.success && r.error.includes("Not found");
  });

  await assert("file_rename with sourcePath/destPath", async () => {
    const r = await registry.executeTool("file_rename", { sourcePath: "_no_src", destPath: "_no_dst" }, toolCtx);
    return !r.success && r.error.toLowerCase().includes("not found");
  });

  await assert("search_code", async () => {
    const r = await registry.executeTool("search_code", { pattern: "moyu", path: "." }, toolCtx);
    return r.success;
  });

  await assert("list_dir", async () => {
    const r = await registry.executeTool("list_dir", { path: "." }, toolCtx);
    return r.success && r.output.includes("package.json");
  });

  await assert("run_command basic", async () => {
    const r = await registry.executeTool("run_command", { command: "node -e console.log(42)", timeout: 5000 }, toolCtx);
    return r.success && r.output.trim() === "42";
  });

  // ====== 4. Git ======
  await assert("git_status", async () => {
    const r = await registry.executeTool("git_status", {}, toolCtx);
    return r.success && r.output.includes("Branch:");
  });

  await assert("git_log (Windows fix)", async () => {
    const r = await registry.executeTool("git_log", { count: 2 }, toolCtx);
    return r.success && r.output.includes("0.2.0");
  });

  await assert("git_diff", async () => {
    const r = await registry.executeTool("git_diff", {}, toolCtx);
    return r.success;
  });

  // ====== 5. Session ======
  const testSid = "_test_session_" + Date.now();

  await assert("saveSession", () => {
    saveSession(process.cwd(), testSid, {
      projectDir: process.cwd(), sessionId: testSid,
      provider: "deepseek", model: "deepseek-chat",
      permissionMode: "confirm",
      messages: [{ role: "user", content: "hi" }]
    });
    return existsSync(join(process.cwd(), ".moyu", "sessions", testSid + ".json"));
  });

  await assert("listSessions", () => {
    return listSessions(process.cwd()).some(s => s.sessionId === testSid);
  });

  await assert("loadLatestSession", () => {
    return loadLatestSession(process.cwd()) !== null;
  });

  await assert("deleteSession", () => {
    return deleteSession(process.cwd(), testSid);
  });

  // ====== 6. Version ======
  await assert("package.json version 0.2.0", () => {
    return JSON.parse(readFileSync("package.json", "utf-8")).version === "0.2.0";
  });

  await assert("Banner v0.2.0", () => {
    return readFileSync("src/agent/index.ts", "utf-8").includes("v0.2.0");
  });

  await assert("MCP server exists", () => {
    return existsSync("moyu-mcp-server.mjs");
  });

  // ====== Results ======
  console.log("\n");
  console.log("=== Results ===");
  console.log("  Passed:", passed);
  console.log("  Failed:", failed);
  errors.forEach(e => console.log("    FAIL:", e));

  const ok = failed === 0;
  console.log(ok ? "\nALL TESTS PASSED" : "\nSOME TESTS FAILED");
  process.exit(ok ? 0 : 1);
}

runAll().catch(e => {
  console.error("\nFatal:", e.message);
  process.exit(1);
});
