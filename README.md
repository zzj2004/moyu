# moyu 🐟

> 终端里的 AI 编程助手 — Terminal AI Coding Agent

moyu 是一个运行在终端中的 AI 编程助手，支持文件读写、代码搜索、命令执行，以及 **MCP 协议** 扩展。

## 特性

- 🗄 **读写文件** — 读取和编辑代码文件，改动前显示 diff 确认
- 🔍 **搜索代码** — 在项目中搜索文本/正则
- 🖥️ **执行命令** — 运行构建、测试、git 等命令
- 🔌 **MCP 支持** — 通过 Model Context Protocol 加载外部工具
- 🛡️ **两级权限** — Confirm（每次确认）/ Trusted（完全信任）
- 🎯 **多 LLM 后端** — 支持 DeepSeek、Kimi、OpenAI 等
- 💬 **流式输出** — 实时显示 AI 响应
- 💾 **会话管理** — 项目级 + 全局双路径自动保存

## 安装

`ash
git clone https://github.com/zzj2004/moyu.git
cd moyu
npm install
npm run build
npm link
`

## 配置

创建 ~/.moyu/config.json：

`json
{
  "llm": {
    "provider": "deepseek",
    "apiKey": "sk-your-deepseek-key",
    "model": "deepseek-chat",
    "baseUrl": "https://api.deepseek.com/v1"
  },
  "providerKeys": {
    "kimi": "sk-your-kimi-key"
  },
  "permissionMode": "confirm",
  "mcpServers": []
}
`

或通过环境变量：

`ash
set MOYU_API_KEY=sk-your-key
set MOYU_MODEL=deepseek-chat
set MOYU_KIMI_API_KEY=sk-your-kimi-key
`

## 使用

`ash
# 交互模式
moyu

# 单次模式
moyu -p "帮我解释这个项目的架构"
moyu "写一个快速排序算法"
`

### 命令列表

| 命令 | 说明 |
|------|------|
| /help | 显示帮助 |
| /clear | 清空对话 |
| /model [name] | 查看/切换模型 |
| /models | 列出当前厂商可用模型 |
| /provider [name] | 查看/切换厂商 |
| /providers | 列出所有厂商及配置状态 |
| /thinking on|off|high|max | 切换思考模式/设置推理深度 |
| /search on|off | 切换联网搜索 |
| /trust | 切换到信任模式 |
| /confirm | 切换到确认模式 |
| /status | 查看当前设置 |
| /img <path> [问题] | 发送图片分析（Kimi 专用） |
| /save | 保存当前会话 |
| /load <name> | 加载会话 |
| /sessions | 列出所有会话 |
| /session-delete <n> | 删除会话 |
| /exit | 退出 |

### 权限级别

| 级别 | 说明 |
|------|------|
| confirm | 每次操作前询问确认 |
| 	rusted | 完全信任，不再询问 |

## MCP 支持

moyu 支持通过 MCP 协议加载外部工具。配置示例：

`json
{
  "mcpServers": [
    {
      "name": "my-server",
      "command": "node",
      "args": ["path/to/mcp-server.js"]
    }
  ]
}
`

## License

MIT
