import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Bot,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  Loader2,
  ShieldCheck,
  Sparkles,
  Target,
  X,
  Zap
} from 'lucide-react';
import questionSets from './data/questionSets.json';
import { runAiAnalysis } from './lib/aiClient';
import { persistRecord } from './lib/records';
import type { AiState, MatchRecord, Option, QuestionSet, Screen } from './types';
import './styles.css';

const sets = questionSets as QuestionSet[];
const questionSet = sets[0];
const totalChallenges = questionSet.questions.length;

const initialAiState: AiState = {
  recognize: '',
  judge: '',
  answer: '',
  logic: [],
  optionId: null,
  elapsedMs: null,
  source: 'fallback'
};

const optionPositionLabels = ['A', 'B', 'C', 'D'];

const panelVariants = {
  initial: { opacity: 0, y: 16, scale: 0.992 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.996 }
};

const formatTime = (ms: number | null) => `${((ms || 0) / 1000).toFixed(1)}`;

const shuffleOptions = (options: Option[]) => {
  const shuffled = [...options];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
};

const createRecordId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const safeScrollToTop = () => {
  try {
    window.scrollTo({ top: 0, left: 0 });
  } catch {
    window.scrollTo(0, 0);
  }
};

const safeConfetti = (options: Parameters<typeof confetti>[0]) => {
  try {
    confetti(options);
  } catch {
    // Celebration is decorative; rendering the next screen is the critical path.
  }
};

const backgroundAssetByType = {
  home: '/assets/generated-backgrounds/home-bg.png',
  lotus: '/assets/generated-backgrounds/glue-bg.png',
  camera: '/assets/generated-backgrounds/camera-bg.png',
  rail: '/assets/generated-backgrounds/rail-bg.png',
  battle: '/assets/generated-backgrounds/battle-bg.png',
  final: '/assets/generated-backgrounds/final-bg.png'
} satisfies Record<'home' | 'lotus' | 'camera' | 'rail' | 'battle' | 'final', string>;

const thumbAssetByOptionId: Record<string, string> = {
  needle: '/assets/generated-thumbnails/thumb-valve-needle.png',
  jet: '/assets/generated-thumbnails/thumb-valve-jet.png',
  screw: '/assets/generated-thumbnails/thumb-valve-screw.png',
  pneumatic: '/assets/generated-thumbnails/thumb-valve-pneumatic.png',
  'mono-global-500': '/assets/generated-thumbnails/thumb-camera-mono-global.png',
  'color-global-2500': '/assets/generated-thumbnails/thumb-camera-color-global.png',
  'mono-rolling-500': '/assets/generated-thumbnails/thumb-camera-mono-rolling.png',
  'color-rolling-2500': '/assets/generated-thumbnails/thumb-camera-color-rolling.png',
  'round-rail': '/assets/generated-thumbnails/thumb-rail-round.png',
  'heavy-roller': '/assets/generated-thumbnails/thumb-rail-heavy.png',
  'plastic-slider': '/assets/generated-thumbnails/thumb-rail-plastic.png',
  'mini-linear': '/assets/generated-thumbnails/thumb-rail-mini.png',
  'roller-linear-guide': '/assets/generated-thumbnails/thumb-rail-heavy.png',
  'drawer-slide': '/assets/generated-thumbnails/thumb-rail-mini.png',
  'ball-linear-guide': '/assets/generated-thumbnails/thumb-rail-ball-linear.png'
};

const fireQuestionConfetti = () => {
  const defaults = {
    particleCount: 96,
    spread: 70,
    startVelocity: 34,
    ticks: 180,
    gravity: 0.82,
    decay: 0.91,
    scalar: 0.95,
    colors: ['#1f6fff', '#0aae32', '#ffffff', '#ffcc4d', '#ff5d8f']
  };

  safeConfetti({
    ...defaults,
    origin: { x: 0.5, y: 0.16 },
    angle: 90
  });
};

const fireFinalConfetti = () => {
  [0.22, 0.5, 0.78].forEach((x, index) => {
    window.setTimeout(() => {
      safeConfetti({
        particleCount: 86,
        spread: 68,
        startVelocity: 35,
        ticks: 180,
        gravity: 0.82,
        decay: 0.91,
        scalar: 0.92,
        origin: { x, y: 0.15 },
        colors: ['#1f6fff', '#0aae32', '#ffffff', '#ffcc4d', '#ff5d8f']
      });
    }, index * 120);
  });
};

const NozzleArt = () => (
  <div className="nozzle-art" aria-hidden="true">
    <div className="nozzle-cap">piezo</div>
    <div className="nozzle-body" />
    <div className="nozzle-tip" />
    <span className="drop drop-one" />
    <span className="drop drop-two" />
  </div>
);

const LotusArt = () => (
  <div className="lotus-art" aria-hidden="true">
    <div className="lotus-base" />
    {Array.from({ length: 8 }).map((_, index) => (
      <span key={index} className={`petal petal-${index + 1}`} />
    ))}
    <span className="lotus-core" />
  </div>
);

const CameraArt = () => (
  <div className="camera-art" aria-hidden="true">
    <div className="camera-body">
      <span className="camera-lens" />
    </div>
    <div className="pcb">
      {Array.from({ length: 12 }).map((_, index) => (
        <span key={index} />
      ))}
    </div>
    <span className="micro-screw screw-one" />
    <span className="micro-screw screw-two" />
    <span className="micro-screw screw-three" />
  </div>
);

const RailArt = () => (
  <div className="rail-art" aria-hidden="true">
    <div className="printer-head" />
    <div className="rail rail-one" />
    <div className="rail rail-two" />
    <div className="rail-block" />
    <div className="printed-object" />
  </div>
);

const PageBackground = ({ type }: { type: keyof typeof backgroundAssetByType }) => (
  <img className={`page-background page-background-${type}`} src={backgroundAssetByType[type]} alt="" aria-hidden="true" />
);

const ProgressDots = ({ currentIndex }: { currentIndex: number }) => (
  <div className="progress-dots" aria-label={`第 ${currentIndex + 1} / ${totalChallenges} 题`}>
    {Array.from({ length: totalChallenges }).map((_, index) => (
      <React.Fragment key={index}>
        <span className={index <= currentIndex ? 'active' : ''}>{index + 1}</span>
        {index < totalChallenges - 1 && <i className={index < currentIndex ? 'active' : ''} />}
      </React.Fragment>
    ))}
  </div>
);

const MiniVisual = ({ type, optionId }: { type?: string; optionId?: string }) => {
  const asset = optionId ? thumbAssetByOptionId[optionId] : undefined;
  if (asset) return <img className="mini-asset" src={asset} alt="" aria-hidden="true" />;

  if (type === 'camera') {
    return (
      <span className="mini-camera" aria-hidden="true">
        <span />
      </span>
    );
  }

  if (type === 'rail') {
    return (
      <span className="mini-rail" aria-hidden="true">
        <span />
      </span>
    );
  }

  return (
    <svg width="30" height="44" viewBox="0 0 30 44" role="img" aria-label="胶阀">
      <rect x="9" y="3" width="10" height="24" rx="3" fill="#2a62d8" />
      <rect x="8" y="4" width="5" height="23" rx="2" fill="#e8eef7" />
      <path d="M10 27h8l-1.2 9h-5.6L10 27Z" fill="#12306e" />
      <path d="M13 36h2l-1 7-1-7Z" fill="#5d6473" />
    </svg>
  );
};

const Chip = ({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) => (
  <span className="chip">
    {icon}
    {children}
  </span>
);

const InfoBox = ({
  icon,
  title,
  text
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) => (
  <div className="info-box">
    <span>{icon}</span>
    <p>
      <strong>{title}</strong>
      {text.split('\n').map((line) => (
        <React.Fragment key={line}>
          {line}
          <br />
        </React.Fragment>
      ))}
    </p>
  </div>
);

const OptionCard = ({
  option,
  displayPrefix,
  isSelected,
  isWrong,
  onSelect,
  disabled
}: {
  option: Option;
  displayPrefix?: string;
  isSelected: boolean;
  isWrong: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) => (
  <button
    className={`option-card ${isSelected ? 'selected' : ''} ${isWrong ? 'wrong' : ''}`}
    onClick={onSelect}
    disabled={disabled}
  >
    <span className="option-icon">
      <MiniVisual type={option.visual} optionId={option.id} />
    </span>
    <span>
      <strong>
        {displayPrefix || option.prefix ? `${displayPrefix || option.prefix} ` : ''}
        {option.label}
      </strong>
      <small>{option.description}</small>
    </span>
    {isSelected && (
      <span className="option-status option-status-correct" aria-hidden="true">
        <Check size={22} strokeWidth={4} />
      </span>
    )}
    {isWrong && (
      <span className="option-status option-status-wrong" aria-hidden="true">
        <X size={22} strokeWidth={4} />
      </span>
    )}
  </button>
);

const StepLine = ({ title, text, complete }: { title: string; text: string; complete: boolean }) => (
  <div className={`step-line ${complete ? 'complete' : ''}`}>
    <span className="step-status">{complete ? <CheckCircle2 size={18} /> : <Loader2 size={18} className="spin" />}</span>
    <div>
      <strong>{title}</strong>
      <p>{text || '正在生成...'}</p>
    </div>
  </div>
);

function App() {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [questionIndex, setQuestionIndex] = useState(0);
  const question = questionSet.questions[questionIndex];
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [wrongOptionId, setWrongOptionId] = useState<string | null>(null);
  const [battleStartedAt, setBattleStartedAt] = useState<number | null>(null);
  const [timerMs, setTimerMs] = useState(0);
  const [userElapsedMs, setUserElapsedMs] = useState<number | null>(null);
  const [userAttemptCount, setUserAttemptCount] = useState(0);
  const [aiState, setAiState] = useState<AiState>(initialAiState);
  const [isAiDone, setIsAiDone] = useState(false);
  const [record, setRecord] = useState<MatchRecord | null>(null);
  const [displayedOptions, setDisplayedOptions] = useState<Option[]>(() => shuffleOptions(question.options));
  const runIdRef = useRef(0);
  const completionKeyRef = useRef<string | null>(null);

  const selectedOption = useMemo(
    () => question.options.find((option) => option.id === selectedOptionId) || null,
    [question.options, selectedOptionId]
  );

  const aiOption = useMemo(
    () => question.options.find((option) => option.id === aiState.optionId) || null,
    [aiState.optionId, question.options]
  );

  const isFinalQuestion = questionIndex === totalChallenges - 1;

  useEffect(() => {
    safeScrollToTop();
  }, [screen, questionIndex]);

  useEffect(() => {
    if (screen !== 'battle' || battleStartedAt === null) return undefined;

    const intervalId = window.setInterval(() => {
      setTimerMs(performance.now() - battleStartedAt);
    }, 100);

    return () => window.clearInterval(intervalId);
  }, [battleStartedAt, screen]);

  useEffect(() => {
    if (!selectedOption || !aiOption || userElapsedMs === null || aiState.elapsedMs === null || !isAiDone) return;

    const completionKey = `${question.id}-${selectedOption.id}-${aiOption.id}-${Math.round(userElapsedMs)}`;
    if (completionKeyRef.current === completionKey) return;
    completionKeyRef.current = completionKey;

    const nextRecord: MatchRecord = {
      id: createRecordId(),
      createdAt: new Date().toISOString(),
      questionSetId: questionSet.id,
      questionId: question.id,
      challengeIndex: questionIndex + 1,
      totalChallenges,
      prompt: question.prompt,
      userOptionId: selectedOption.id,
      userOptionLabel: selectedOption.label,
      userElapsedMs,
      userAttemptCount,
      aiOptionId: aiOption.id,
      aiOptionLabel: aiOption.label,
      aiElapsedMs: aiState.elapsedMs,
      aiSteps: {
        recognize: aiState.recognize,
        judge: aiState.judge,
        answer: aiState.answer
      },
      aiLogic: aiState.logic.slice(0, 3),
      userCorrect: selectedOption.id === question.correctOptionId,
      aiCorrect: aiOption.id === question.correctOptionId,
      aiSource: aiState.source
    };

    const transitionTimer = window.setTimeout(() => {
      void persistRecord(nextRecord);
      setRecord(nextRecord);
      setScreen('result');
      if (isFinalQuestion) {
        fireFinalConfetti();
      } else {
        fireQuestionConfetti();
      }
    }, 1000);

    return () => window.clearTimeout(transitionTimer);
  }, [aiOption, aiState, isAiDone, isFinalQuestion, question, questionIndex, selectedOption, userAttemptCount, userElapsedMs]);

  const startBattle = () => {
    runIdRef.current += 1;
    const runId = runIdRef.current;
    completionKeyRef.current = null;
    setScreen('battle');
    setSelectedOptionId(null);
    setWrongOptionId(null);
    setUserElapsedMs(null);
    setUserAttemptCount(0);
    setAiState(initialAiState);
    setIsAiDone(false);
    setRecord(null);
    setDisplayedOptions(shuffleOptions(question.options));
    setTimerMs(0);
    const now = performance.now();
    setBattleStartedAt(now);

    void runAiAnalysis(question, (partial) => {
      if (runId !== runIdRef.current) return;
      setAiState((previous) => ({ ...previous, ...partial }));
    }).then((finalState) => {
      if (runId !== runIdRef.current) return;
      setIsAiDone(true);
      setAiState(finalState);
    });
  };

  const chooseOption = (optionId: string) => {
    if (selectedOptionId || !battleStartedAt) return;

    const nextAttemptCount = userAttemptCount + 1;
    setUserAttemptCount(nextAttemptCount);

    if (optionId !== question.correctOptionId) {
      setWrongOptionId(optionId);
      window.setTimeout(() => setWrongOptionId((current) => (current === optionId ? null : current)), 1000);
      return;
    }

    setSelectedOptionId(optionId);
    setUserElapsedMs(performance.now() - battleStartedAt);
  };

  const goNextChallenge = () => {
    if (isFinalQuestion) return;
    runIdRef.current += 1;
    completionKeyRef.current = null;
    setQuestionIndex((index) => index + 1);
    setScreen('briefing');
    setSelectedOptionId(null);
    setWrongOptionId(null);
    setBattleStartedAt(null);
    setTimerMs(0);
    setUserElapsedMs(null);
    setUserAttemptCount(0);
    setAiState(initialAiState);
    setIsAiDone(false);
    setRecord(null);
  };

  return (
    <main className="app-shell">
      <div className="stage">
        <AnimatePresence mode="wait">
          {screen === 'welcome' && (
            <motion.section key="welcome" className="screen welcome-screen" {...panelVariants}>
              <PageBackground type="home" />
              <div className="soft-flower flower-left" />
              <div className="soft-flower flower-right" />
              <div className="welcome-copy">
                <h1>Hi! 想和 AI 比一比吗?</h1>
                <p>体验 AI 如何理解工艺并推荐选型</p>
              </div>
              <div className="welcome-actions">
                <motion.button className="primary-button large" whileTap={{ scale: 0.96 }} onClick={() => setScreen('briefing')}>
                  开始挑战
                </motion.button>
                <p className="privacy-note">
                  <ShieldCheck size={18} />
                  您与AI的互动仅用于体验，不会被保存
                </p>
              </div>
            </motion.section>
          )}

          {screen === 'briefing' && (
            <motion.section key={`briefing-${question.id}`} className={`screen briefing-screen visual-${question.visual}`} {...panelVariants}>
              <PageBackground type={question.visual} />
              <div className="briefing-progress">
                <ProgressDots currentIndex={questionIndex} />
              </div>
              <div className="briefing-content">
                <h2>
                  {question.prompt.split('\n').map((line) => (
                    <React.Fragment key={line}>
                      {line}
                      <br />
                    </React.Fragment>
                  ))}
                </h2>
                <div className="info-grid">
                  <InfoBox icon={<Building2 size={34} />} title="背景：" text={question.background} />
                  <InfoBox icon={<Clock3 size={36} />} title="要求：" text={question.requirement} />
                </div>
                <motion.button className="primary-button" whileTap={{ scale: 0.96 }} onClick={startBattle}>
                  开始答题
                </motion.button>
              </div>
            </motion.section>
          )}

          {screen === 'battle' && (
            <motion.section key={`battle-${question.id}`} className="screen battle-screen" {...panelVariants}>
              <PageBackground type="battle" />
              <header className="battle-header">
                <ProgressDots currentIndex={questionIndex} />
                <h2>{question.prompt}</h2>
                <div className="hint-row compact">
                  {question.hintTags.map((tag, index) => (
                    <Chip
                      key={tag}
                      icon={[<Target size={15} />, <Sparkles size={15} />, <Zap size={15} />, <CircleDot size={15} />][index]}
                    >
                      {tag}
                    </Chip>
                  ))}
                </div>
              </header>

              <div className="battle-grid">
                <section className="choice-panel">
                  <h3>您的选择</h3>
                  <div className="options-list">
                    {displayedOptions.map((option, index) => (
                      <OptionCard
                        key={option.id}
                        option={option}
                        displayPrefix={optionPositionLabels[index]}
                        isSelected={option.id === selectedOptionId}
                        isWrong={option.id === wrongOptionId}
                        onSelect={() => chooseOption(option.id)}
                        disabled={Boolean(selectedOptionId)}
                      />
                    ))}
                  </div>
                  <AnimatePresence>
                    {wrongOptionId && (
                      <motion.p
                        className="wrong-hint"
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      >
                        选错了，再试一次
                      </motion.p>
                    )}
                  </AnimatePresence>
                </section>

                <section className="ai-panel">
                  <h3>{isAiDone ? 'AI 已完成答题' : 'AI 思考中'}</h3>
                  <div className="bot-box">
                    <Bot size={54} />
                    {isAiDone ? <span>用时 {formatTime(aiState.elapsedMs)} 秒</span> : <i className="thinking-dot" />}
                  </div>
                  <p className="done-count">
                    已完成 {Number(Boolean(aiState.recognize)) + Number(Boolean(aiState.judge)) + Number(Boolean(aiState.answer))} 项思考分析
                  </p>
                  <StepLine title="识别" text={aiState.recognize} complete={Boolean(aiState.recognize)} />
                  <StepLine title="判断" text={aiState.judge} complete={Boolean(aiState.judge)} />
                  <StepLine title="匹配" text={aiState.answer} complete={Boolean(aiState.answer)} />
                  <AnimatePresence>
                    {isAiDone && (
                      <motion.p
                        className="ai-ready-tag"
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      >
                        我选好了，等你哦~
                      </motion.p>
                    )}
                  </AnimatePresence>
                </section>
              </div>

              <footer className="battle-footer">
                <div className="timer-pill">
                  <Clock3 size={18} />
                  已用时 {Math.floor(timerMs / 1000)} 秒
                </div>
              </footer>
            </motion.section>
          )}

          {screen === 'result' && record && (
            <motion.section key={`result-${record.questionId}`} className="screen result-screen" {...panelVariants}>
              <PageBackground type={isFinalQuestion ? 'final' : question.visual} />
              <div className="result-content">
                {isFinalQuestion ? (
                  <div className="result-top">
                    <ProgressDots currentIndex={questionIndex} />
                    <h2>感谢体验，挑战已完成 🎉</h2>
                  </div>
                ) : (
                  <div className="result-top">
                    <ProgressDots currentIndex={questionIndex} />
                    <motion.button className="primary-button next" whileTap={{ scale: 0.96 }} onClick={goNextChallenge}>
                      下一题
                      <ChevronRight size={28} />
                    </motion.button>
                  </div>
                )}

                <div className="score-row">
                  <div className="score-box user">
                    <span>你的用时</span>
                    <strong>
                      {formatTime(record.userElapsedMs)} <small>秒</small>
                    </strong>
                  </div>
                  <div className="score-box ai">
                    <span>AI 用时</span>
                    <strong>
                      {formatTime(record.aiElapsedMs)} <small>秒</small>
                    </strong>
                  </div>
                </div>

                <section className="recommendation">
                  <h3>
                    AI 推荐：
                    <span>{record.aiOptionLabel}</span>
                  </h3>
                  <h4>AI 的判断逻辑</h4>
                  <div className="logic-list">
                    {record.aiLogic.map((item) => (
                      <div className="logic-item" key={item}>
                        <CheckCircle2 size={19} />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </section>
                {isFinalQuestion && (
                  <motion.button className="restart-button" whileTap={{ scale: 0.96 }} onClick={() => window.location.reload()}>
                    重新挑战
                  </motion.button>
                )}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
