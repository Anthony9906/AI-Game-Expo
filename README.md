# AI Game Expo

展会 H5 互动小游戏第二版：观众与 AI 完成 3 题选型闯关挑战。

## 启动

```bash
npm install
npm run dev
```

当前开发服务通常启动在：

```text
http://localhost:5174/
```

后台运行推荐使用：

```bash
scripts/game-service.sh start
scripts/game-service.sh status
scripts/game-service.sh restart
scripts/game-service.sh stop
```

脚本默认监听 `http://localhost:5173/`，日志写入 `.runtime/game-service.log`。

## 模型配置

复制 `.env.example` 为 `.env`，配置 OpenAI-compatible 接口：

```bash
VITE_AI_BASE_URL=http://10.10.14.50:30000/v1
VITE_AI_API_KEY=your_api_key
VITE_AI_MODEL=Qwen3.6-35B
VITE_AI_PROVIDER_NAME=expo-llm
VITE_AI_STRUCTURED_OUTPUTS=true
VITE_AI_DISABLE_THINKING=true
VITE_AI_TIMEOUT_MS=8000
VITE_AI_STREAMING=true
VITE_AI_FORCE_LOCAL_FALLBACK=false
```

AI 使用 OpenAI-compatible 接口实时生成选型分析，并默认优先走流式响应；未配置 `VITE_AI_API_KEY`、模型接口超时、流式解析失败或结构化输出不可用时，应用会自动退回非流式模型调用，再不成功则使用本地兜底内容分步演示。`VITE_AI_DISABLE_THINKING=true` 用于当前 Qwen/SGLang 服务，避免模型先输出 reasoning 内容导致展会交互超时；`VITE_AI_TIMEOUT_MS` 可按现场网络延迟调整。若现场模型服务流式兼容性异常，可设置 `VITE_AI_STREAMING=false` 暂时关闭流式优先路径；若需要完全跳过模型请求，设置 `VITE_AI_FORCE_LOCAL_FALLBACK=true`，应用会直接使用题库内置的本地兜底内容。

## 题库

题目数据在 `src/data/questionSets.json`，当前包含 3 道闯关题，结构已按多题集、多题目模式组织。

## 比赛记录

UI 不显示下载、查看记录等入口。每次答题结束会静默记录：

- 使用 Vite 本地服务的 `/__records` 中间件写入 `records/*.md`；
- 同步写入浏览器 `localStorage`，作为纯静态环境下的静默兜底。
