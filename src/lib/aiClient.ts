import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output, streamText } from "ai";
import { z } from "zod";
import type { AiState, AiStepKey, Question } from "../types";

type AiPayload = {
  recognize: string;
  judge: string;
  answer: string;
  logic: string[];
  optionId: string;
};

const env = import.meta.env;

const sleep = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));
const randomBetween = (min: number, max: number) =>
  min + Math.random() * (max - min);
const AI_MIN_ELAPSED_MS = 2200;
const AI_MAX_ELAPSED_MS = 3000;
const DEFAULT_AI_MODEL_TIMEOUT_MS = 8000;
const AI_STEP_MIN_GAP_MS = 650;
const AI_STREAM_STEP_MIN_GAP_MS = 700;
const TEXT_LIMIT = 46;
const aiStepKeys = ["recognize", "judge", "answer"] as const;

type ModelSettings = {
  apiKey: string;
  baseURL: string;
  model: string;
  providerName: string;
  structuredOutputs: boolean;
  disableThinking: boolean;
  timeoutMs: number;
  streaming: boolean;
};

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const shouldForceLocalFallback = () =>
  env.VITE_AI_FORCE_LOCAL_FALLBACK === "true";

const aiSelectionSchema = z.object({
  recognize: z
    .string()
    .describe("一句话识别当前工况的关键特征，适合展会大屏展示。"),
  judge: z.string().describe("一句话判断最关键的选型约束。"),
  answer: z.string().describe("一句话给出推荐结论，不要超过屏幕可读长度。"),
  logic: z
    .array(z.string())
    .describe("三条简短判断逻辑，每条聚焦一个选型理由。"),
  optionId: z.string().describe("最终推荐选项的 id，必须来自候选选项。"),
});

const getModelSettings = (): ModelSettings | null => {
  const apiKey = env.VITE_AI_API_KEY?.trim();
  const baseURL =
    env.VITE_AI_BASE_URL?.replace(/\/$/, "") || "https://api.openai.com/v1";
  const model = env.VITE_AI_MODEL?.trim() || "gpt-4.1-mini";
  const providerName = env.VITE_AI_PROVIDER_NAME?.trim() || "expo-llm";
  const structuredOutputs = env.VITE_AI_STRUCTURED_OUTPUTS !== "false";
  const disableThinking = env.VITE_AI_DISABLE_THINKING === "true";
  const timeoutMs = parsePositiveInt(
    env.VITE_AI_TIMEOUT_MS,
    DEFAULT_AI_MODEL_TIMEOUT_MS,
  );
  const streaming = env.VITE_AI_STREAMING !== "false";

  if (!apiKey || !baseURL || !model) return null;

  return {
    apiKey,
    baseURL,
    model,
    providerName,
    structuredOutputs,
    disableThinking,
    timeoutMs,
    streaming,
  };
};

const createProvider = (settings: ModelSettings) =>
  createOpenAICompatible({
    name: settings.providerName,
    apiKey: settings.apiKey,
    baseURL: settings.baseURL,
    supportsStructuredOutputs: settings.structuredOutputs,
  });

const getProviderOptions = (settings: ModelSettings) =>
  settings.disableThinking
    ? {
        [settings.providerName]: {
          chat_template_kwargs: {
            enable_thinking: false,
          },
        },
      }
    : undefined;

const trimText = (value: string, limit = TEXT_LIMIT) => {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
};

const normalizeLogic = (logic: unknown, question: Question) => {
  const generated = Array.isArray(logic)
    ? logic
        .map((item) => (typeof item === "string" ? trimText(item) : ""))
        .filter(Boolean)
    : [];

  const reference = question.aiLogic.map((item) => trimText(item));
  const merged = [...generated, ...reference].filter(Boolean);
  const unique = Array.from(new Set(merged));

  return unique.slice(0, 3);
};

const getOptionLabel = (question: Question, optionId: string) =>
  question.options.find((option) => option.id === optionId)?.label || optionId;

const replaceOptionIds = (text: string, question: Question) =>
  question.options.reduce(
    (nextText, option) => nextText.replaceAll(option.id, option.label),
    text,
  );

const normalizeAnswer = (
  answer: string | undefined,
  question: Question,
  optionId: string,
) => {
  const label = getOptionLabel(question, optionId);
  const text = trimText(answer || `推荐选择：${label}`);

  return trimText(replaceOptionIds(text, question));
};

const normalizePayload = (
  payload: Partial<AiPayload>,
  question: Question,
): AiPayload | null => {
  if (
    !payload.optionId ||
    !question.options.some((option) => option.id === payload.optionId)
  ) {
    return null;
  }

  const logic = normalizeLogic(payload.logic, question);

  return {
    recognize: trimText(
      replaceOptionIds(payload.recognize || question.aiSteps.recognize, question),
    ),
    judge: trimText(
      replaceOptionIds(payload.judge || question.aiSteps.judge, question),
    ),
    answer: normalizeAnswer(payload.answer, question, payload.optionId),
    logic:
      logic.length === 3
        ? logic
        : question.aiLogic.slice(0, 3).map((item) => trimText(item)),
    optionId: payload.optionId,
  };
};

const buildSystemPrompt = () => `你是展会现场的工业自动化选型 AI。
你的任务是基于用户提供的题目事实、候选项、已验证正确答案和参考逻辑，生成适合互动大屏展示的 AI 分析过程。
要求：
1. 必须使用简洁中文，面向非专家观众也能读懂。
2. 不引入题目外的工艺参数、品牌、价格或未经提供的事实。
3. 输出要短，避免长句，适合 iPad 横屏展示。
4. optionId 必须来自候选选项 id。
5. 已验证正确答案是权威依据，通常应返回该 optionId；如果返回其他合法 optionId，必须是基于题目事实的判断。
6. 只生成结构化 JSON 对象字段：recognize、judge、answer、logic、optionId。不要输出 Markdown、解释或思考过程。`;

const buildUserPrompt = (question: Question) => {
  const correctOption = question.options.find(
    (option) => option.id === question.correctOptionId,
  );
  const optionList = question.options
    .map((option) => `- ${option.id}: ${option.label}。${option.description}`)
    .join("\n");

  return `请为当前展会互动题生成 AI 选型分析。

题目：
${question.prompt}

领域：
${question.domainLabel}

背景：
${question.background || "无额外背景"}

要求：
${question.requirement}

提示标签：
${question.hintTags.join("、")}

候选选项：
${optionList}

已验证正确答案：
${question.correctOptionId}: ${correctOption?.label || question.aiAnswer}

参考步骤：
- 识别：${question.aiSteps.recognize}
- 判断：${question.aiSteps.judge}
- 匹配：${question.aiSteps.answer}

参考判断逻辑：
${question.aiLogic.map((item, index) => `${index + 1}. ${item}`).join("\n")}

请严格生成以下字段：
- recognize：一句话识别当前工况。
- judge：一句话判断关键选型约束。
- answer：一句话给出推荐结论，最好包含候选项名称。
- logic：正好 3 条字符串，每条尽量短。
- optionId：必须来自候选选项 id。`;
};

const callModel = async (question: Question): Promise<AiPayload | null> => {
  const settings = getModelSettings();
  if (!settings) return null;

  const provider = createProvider(settings);

  const result = await generateText({
    model: provider.chatModel(settings.model),
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(question),
    output: Output.object({
      schema: aiSelectionSchema,
      name: "selectionAnalysis",
      description: "展会互动选型题的结构化 AI 分析结果",
    }),
    temperature: 0.35,
    // maxOutputTokens: 420,
    maxRetries: 0,
    timeout: settings.timeoutMs,
    providerOptions: getProviderOptions(settings),
  });

  return normalizePayload(result.output, question);
};

const getPayloadStep = (payload: AiPayload, step: AiStepKey) => {
  if (step === "recognize") return payload.recognize;
  if (step === "judge") return payload.judge;
  return payload.answer;
};

const callModelStream = async (
  question: Question,
  onState: (state: Partial<AiState>) => void,
  publishedSteps: Set<AiStepKey>,
): Promise<AiPayload | null> => {
  const settings = getModelSettings();
  if (!settings || !settings.streaming) return null;

  const provider = createProvider(settings);
  const result = streamText({
    model: provider.chatModel(settings.model),
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(question),
    output: Output.object({
      schema: aiSelectionSchema,
      name: "selectionAnalysis",
      description: "展会互动选型题的结构化 AI 分析结果",
    }),
    temperature: 0.35,
    maxRetries: 0,
    timeout: settings.timeoutMs,
    providerOptions: getProviderOptions(settings),
  });

  let currentStepIndex = 0;
  let lastStepChangedAt = performance.now();
  const lastTexts: Partial<Record<AiStepKey, string>> = {};

  const moveToStep = async (step: AiStepKey) => {
    const nextStepIndex = aiStepKeys.indexOf(step);
    if (nextStepIndex <= currentStepIndex) return;

    const remainingMs =
      AI_STREAM_STEP_MIN_GAP_MS - (performance.now() - lastStepChangedAt);
    if (remainingMs > 0) await sleep(remainingMs);

    currentStepIndex = nextStepIndex;
    lastStepChangedAt = performance.now();
    onState({ currentStep: step });
  };

  const publishStepText = async (step: AiStepKey, value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return;

    await moveToStep(step);

    const text = trimText(replaceOptionIds(value, question));
    if (lastTexts[step] === text) return;

    lastTexts[step] = text;
    publishedSteps.add(step);
    onState({ [step]: text, currentStep: step });
  };

  for await (const partial of result.partialOutputStream) {
    const payload = partial as Partial<AiPayload>;
    await publishStepText("recognize", payload.recognize);
    await publishStepText("judge", payload.judge);
    await publishStepText("answer", payload.answer);
  }

  return normalizePayload((await result.output) as Partial<AiPayload>, question);
};

const fallbackPayload = (question: Question): AiPayload => ({
  recognize: question.aiSteps.recognize,
  judge: question.aiSteps.judge,
  answer: question.aiSteps.answer,
  logic: question.aiLogic.slice(0, 3),
  optionId: question.correctOptionId,
});

export const runAiAnalysis = async (
  question: Question,
  onState: (state: Partial<AiState>) => void,
): Promise<AiState> => {
  const startedAt = performance.now();
  const targetElapsedMs = randomBetween(AI_MIN_ELAPSED_MS, AI_MAX_ELAPSED_MS);
  let source: AiState["source"] = "model";
  let payload: AiPayload | null = null;
  const publishedSteps = new Set<AiStepKey>();

  onState({ currentStep: "recognize" });

  if (shouldForceLocalFallback()) {
    source = "fallback";
    payload = fallbackPayload(question);
  } else {
    try {
      payload = await callModelStream(question, onState, publishedSteps);
    } catch {
      payload = null;
    }

    if (!payload) {
      try {
        payload = await callModel(question);
      } catch {
        payload = null;
      }
    }

    if (!payload) {
      source = "fallback";
      payload = fallbackPayload(question);
    }
  }

  let lastRevealAt = performance.now() - AI_STEP_MIN_GAP_MS;
  const revealAt = async (ratio: number, state: Partial<AiState>) => {
    const plannedAt = startedAt + targetElapsedMs * ratio;
    const earliestSequentialAt = lastRevealAt + AI_STEP_MIN_GAP_MS;
    const remainingMs =
      Math.max(plannedAt, earliestSequentialAt) - performance.now();
    if (remainingMs > 0) await sleep(remainingMs);
    onState(state);
    lastRevealAt = performance.now();
  };

  const revealStep = async (
    step: AiStepKey,
    ratio: number,
    state: Partial<AiState>,
  ) => {
    if (publishedSteps.has(step)) return;
    onState({ currentStep: step });
    await revealAt(ratio, state);
    publishedSteps.add(step);
  };

  await revealStep("recognize", 0.28, {
    recognize: getPayloadStep(payload, "recognize"),
  });
  await revealStep("judge", 0.58, {
    judge: getPayloadStep(payload, "judge"),
  });
  await revealStep("answer", 0.86, {
    answer: getPayloadStep(payload, "answer"),
  });

  const elapsedMs = Math.max(
    AI_MIN_ELAPSED_MS,
    performance.now() - startedAt,
    targetElapsedMs,
  );
  const remainingMs = elapsedMs - (performance.now() - startedAt);
  if (remainingMs > 0) await sleep(remainingMs);

  const finalState: AiState = {
    recognize: payload.recognize,
    judge: payload.judge,
    answer: payload.answer,
    logic: payload.logic.slice(0, 3),
    optionId: payload.optionId,
    elapsedMs,
    currentStep: null,
    source,
  };

  onState(finalState);
  return finalState;
};
