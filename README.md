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
VITE_AI_BASE_URL=https://api.openai.com/v1
VITE_AI_API_KEY=your_api_key
VITE_AI_MODEL=gpt-4.1-mini
```

未配置 `VITE_AI_API_KEY` 时，应用会使用本地兜底内容流式演示，AI 会在 1.5-3 秒内完成答题，便于展会现场离线测试。

## 题库

题目数据在 `src/data/questionSets.json`，当前包含 3 道闯关题，结构已按多题集、多题目模式组织。

## 比赛记录

UI 不显示下载、查看记录等入口。每次答题结束会静默记录：

- 使用 Vite 本地服务的 `/__records` 中间件写入 `records/*.md`；
- 同步写入浏览器 `localStorage`，作为纯静态环境下的静默兜底。
