import type { AiState, Question } from '../types';

type AiPayload = {
  recognize: string;
  judge: string;
  answer: string;
  logic: string[];
  optionId: string;
};

const env = import.meta.env;

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

const normalizePayload = (payload: Partial<AiPayload>, question: Question): AiPayload => {
  const fallbackOption = question.options.find((option) => option.id === question.correctOptionId);

  return {
    recognize: payload.recognize?.trim() || question.aiSteps.recognize,
    judge: payload.judge?.trim() || question.aiSteps.judge,
    answer: payload.answer?.trim() || question.aiSteps.answer,
    logic:
      payload.logic?.filter(Boolean).slice(0, 3) ||
      question.aiLogic.slice(0, 3),
    optionId:
      question.options.some((option) => option.id === payload.optionId)
        ? String(payload.optionId)
        : fallbackOption?.id || question.correctOptionId
  };
};

const getTaggedValue = (text: string, tag: string) => {
  const closed = text.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, 'i'));
  if (closed?.[1]) return closed[1].trim();

  const open = text.match(new RegExp(`<${tag}>\\s*([\\s\\S]*)`, 'i'));
  if (!open?.[1]) return '';

  return open[1].replace(/<recognize>|<judge>|<answer>|<logic>|<item>|<optionId>[\s\S]*/i, '').trim();
};

const readPayloadFromTaggedText = (text: string): Partial<AiPayload> => {
  const logicBlock = getTaggedValue(text, 'logic');
  const logic = Array.from(logicBlock.matchAll(/<item>\s*([\s\S]*?)\s*<\/item>/gi))
    .map((match) => match[1]?.trim())
    .filter(Boolean);

  return {
    recognize: getTaggedValue(text, 'recognize'),
    judge: getTaggedValue(text, 'judge'),
    answer: getTaggedValue(text, 'answer'),
    logic,
    optionId: getTaggedValue(text, 'optionId')
  };
};

const callModel = async (
  question: Question,
  onState: (state: Partial<AiState>) => void
): Promise<AiPayload | null> => {
  const apiKey = env.VITE_AI_API_KEY?.trim();
  const baseUrl = env.VITE_AI_BASE_URL?.replace(/\/$/, '') || 'https://api.openai.com/v1';
  const model = env.VITE_AI_MODEL?.trim() || 'gpt-4.1-mini';

  if (!apiKey) return null;

  const optionList = question.options
    .map((option) => `${option.id}: ${option.label} - ${option.description}`)
    .join('\n');

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 1500);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            '你是展会现场的胶阀选型 AI。用简洁中文回答。必须按固定标签输出，不要 Markdown。格式为 <recognize>...</recognize><judge>...</judge><answer>...</answer><logic><item>...</item><item>...</item><item>...</item></logic><optionId>...</optionId>。logic 必须正好 3 条，optionId 必须来自给定选项。'
        },
        {
          role: 'user',
          content: `题目：${question.prompt}\n场景：${question.scene}\n选项：\n${optionList}`
        }
      ],
      stream: true
    })
  });

  if (!response.ok || !response.body) {
    window.clearTimeout(timeoutId);
    return null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let content = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data: '));

    for (const line of lines) {
      const payload = line.slice(6);
      if (payload === '[DONE]') continue;

      try {
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        content += parsed.choices?.[0]?.delta?.content || '';
      } catch {
        continue;
      }
    }

    const partial = readPayloadFromTaggedText(content);
    onState({
      recognize: partial.recognize || undefined,
      judge: partial.judge || undefined,
      answer: partial.answer || undefined,
      logic: partial.logic?.slice(0, 3)
    });
  }

  window.clearTimeout(timeoutId);

  return normalizePayload(readPayloadFromTaggedText(content), question);
};

const fallbackPayload = (question: Question): AiPayload => ({
  recognize: question.aiSteps.recognize,
  judge: question.aiSteps.judge,
  answer: question.aiSteps.answer,
  logic: question.aiLogic.slice(0, 3),
  optionId: question.correctOptionId
});

const streamText = async (
  text: string,
  onChunk: (value: string) => void,
  minMs = 16
) => {
  let output = '';
  const chars = Array.from(text);

  for (const char of chars) {
    output += char;
    onChunk(output);
    await sleep(minMs);
  }
};

export const runAiAnalysis = async (
  question: Question,
  onState: (state: Partial<AiState>) => void
): Promise<AiState> => {
  const startedAt = performance.now();
  const targetElapsedMs = randomBetween(1800, 3600);
  let source: AiState['source'] = 'model';
  let payload: AiPayload | null = null;

  try {
    payload = await callModel(question, () => undefined);
  } catch {
    payload = null;
  }

  if (!payload) {
    source = 'fallback';
    payload = fallbackPayload(question);
  }

  let lastRevealAt = performance.now() - 340;
  const revealAt = async (ratio: number, state: Partial<AiState>) => {
    const plannedAt = startedAt + targetElapsedMs * ratio;
    const earliestSequentialAt = lastRevealAt + 340;
    const remainingMs = Math.max(plannedAt, earliestSequentialAt) - performance.now();
    if (remainingMs > 0) await sleep(remainingMs);
    onState(state);
    lastRevealAt = performance.now();
  };

  await revealAt(0.3, { recognize: payload.recognize });
  await revealAt(0.62, { judge: payload.judge });
  await revealAt(0.9, {
    answer: payload.answer,
    logic: payload.logic.slice(0, 3),
    optionId: payload.optionId
  });

  const elapsedMs = Math.min(3600, Math.max(1800, performance.now() - startedAt, targetElapsedMs));
  const remainingMs = elapsedMs - (performance.now() - startedAt);
  if (remainingMs > 0) await sleep(remainingMs);

  const finalState: AiState = {
    recognize: payload.recognize,
    judge: payload.judge,
    answer: payload.answer,
    logic: payload.logic.slice(0, 3),
    optionId: payload.optionId,
    elapsedMs,
    source
  };

  onState(finalState);
  return finalState;
};
