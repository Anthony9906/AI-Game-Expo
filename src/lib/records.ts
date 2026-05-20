import type { MatchRecord } from '../types';

const STORAGE_KEY = 'ai-game-expo-match-records';

export const recordToMarkdown = (record: MatchRecord) => `# AI 选型闯关记录

- 记录 ID: ${record.id}
- 时间: ${record.createdAt}
- 当前关卡: ${record.challengeIndex} / ${record.totalChallenges}
- 题目: ${record.prompt}
- AI 来源: ${record.aiSource === 'model' ? '已配置模型接口' : '本地兜底模拟'}

## 用户作答

- 选择: ${record.userOptionLabel} (${record.userOptionId})
- 用时: ${(record.userElapsedMs / 1000).toFixed(1)} 秒
- 选择次数: ${record.userAttemptCount} 次
- 是否正确: ${record.userCorrect ? '是' : '否'}

## AI 作答

- 选择: ${record.aiOptionLabel} (${record.aiOptionId})
- 用时: ${(record.aiElapsedMs / 1000).toFixed(1)} 秒
- 是否正确: ${record.aiCorrect ? '是' : '否'}

## AI 固定流程

### 识别

${record.aiSteps.recognize}

### 判断

${record.aiSteps.judge}

### 答案

${record.aiSteps.answer}

## AI 判断逻辑

${record.aiLogic.map((item, index) => `${index + 1}. ${item}`).join('\n')}
`;

export const saveRecordLocally = (record: MatchRecord) => {
  try {
    const existingRaw = window.localStorage.getItem(STORAGE_KEY);
    const existing = existingRaw ? (JSON.parse(existingRaw) as MatchRecord[]) : [];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...existing].slice(0, 100)));
  } catch {
    // Some iPad Safari modes can reject localStorage writes. Do not block result rendering.
  }
};

export const persistRecord = async (record: MatchRecord) => {
  saveRecordLocally(record);

  try {
    await fetch('/__records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: `${record.challengeIndex}-${record.questionId}-${record.id}.md`,
        markdown: recordToMarkdown(record)
      })
    });
  } catch {
    // Static builds do not have the Vite record middleware. localStorage remains silent fallback.
  }
};
