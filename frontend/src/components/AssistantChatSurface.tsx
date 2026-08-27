import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Image as ImageIcon,
  Send,
  X,
  Copy,
  Check,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Layers,
  FileText,
  ChevronDown,
  ChevronUp,
  Square,
  Plus,
  RotateCcw,
  Trash2
} from 'lucide-react';
import { runAgentStream, AgentStreamEvent } from '../agent/agentClient';
import { MarkdownRenderer } from './MarkdownRenderer';

interface AssistantChatSurfaceProps {
  onApplyPrompt: (prompt: string) => void;
}

export interface TrajectorySkill {
  name: string;
  description: string;
  imageCount: number;
}

export interface TrajectoryValidation {
  errors: string[];
  valid: boolean;
}

export interface TrajectoryEvaluation {
  result: string;
  iteration: number;
}

export interface AgentTrajectory {
  skill?: TrajectorySkill;
  draft?: string;
  validation?: TrajectoryValidation;
  evaluation?: TrajectoryEvaluation;
  refinements?: Array<{ draft: string; iteration: number }>;
  finalPrompt?: string;
  error?: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  currentNode?: 'discover' | 'draft' | 'validate' | 'evaluate' | 'refine' | 'final';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  trajectory?: AgentTrajectory;
  timestamp: number;
}

const DEFAULT_SUGGESTIONS = [
  {
    title: '赛博朋克雨夜追逐战',
    tag: 'T2VA · 文生模式',
    prompt: '雨夜赛博朋克街道上的快速追车与特写推拉镜头，伴随引擎轰鸣与低音合成器配乐'
  },
  {
    title: '微距水滴自然景致',
    tag: 'I2VA · 首帧锚定',
    prompt: '微距镜头：雨滴落在荷叶表面溅起水花，慢动作推拉镜头与自然环境音'
  },
  {
    title: '星环穿梭与异星降落',
    tag: 'FL2VA · 首尾帧插值',
    prompt: '宏大史诗：飞船穿梭过星环并平稳降落在异星基地的多镜头切镜'
  }
];

export function AssistantChatSurface({ onApplyPrompt }: AssistantChatSurfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [inputPrompt, setInputPrompt] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedDrafts, setExpandedDrafts] = useState<Record<string, boolean>>({});

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, isRunning, scrollToBottom]);

  // Handle Starting a New Chat - True Clear Screen
  const handleNewChat = () => {
    if (isRunning && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setInputPrompt('');
    setSelectedImages([]);
    setExpandedDrafts({});
    setIsRunning(false);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };


  // Handle Image File Selection
  const handleImageFiles = (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (fileArr.length === 0) return;

    fileArr.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          setSelectedImages((prev) => [...prev, result]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleImageFiles(e.target.files);
      e.target.value = '';
    }
  };

  // Clipboard Paste Support
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const imgFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) imgFiles.push(file);
      }
    }
    if (imgFiles.length > 0) {
      e.preventDefault();
      handleImageFiles(imgFiles);
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleDraftExpand = (msgId: string) => {
    setExpandedDrafts((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  // Run Agent Pipeline
  const handleSubmit = async (overridePrompt?: string) => {
    const textToSend = (overridePrompt ?? inputPrompt).trim();
    if (!textToSend && selectedImages.length === 0) return;
    if (isRunning) return;

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `asst-${Date.now()}`;
    const currentImages = [...selectedImages];

    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: textToSend,
      images: currentImages,
      timestamp: Date.now()
    };

    const initialAssistantMessage: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      trajectory: {
        status: 'running',
        currentNode: 'discover'
      }
    };

    setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
    setInputPrompt('');
    setSelectedImages([]);
    setIsRunning(true);

    abortControllerRef.current = new AbortController();

    await runAgentStream(
      textToSend,
      currentImages,
      (event: AgentStreamEvent) => {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== assistantMsgId) return msg;

            const traj: AgentTrajectory = msg.trajectory || {
              status: 'running',
              currentNode: 'discover'
            };

            switch (event.type) {
              case 'skill-discovered':
                return {
                  ...msg,
                  trajectory: {
                    ...traj,
                    currentNode: 'draft',
                    skill: {
                      name: String(event.data.skill || 't2va'),
                      description: String(event.data.description || ''),
                      imageCount: Number(event.data.imageCount ?? currentImages.length)
                    }
                  }
                };

              case 'draft':
                return {
                  ...msg,
                  trajectory: {
                    ...traj,
                    currentNode: 'validate',
                    draft: String(event.data.draft || '')
                  }
                };

              case 'validation':
                return {
                  ...msg,
                  trajectory: {
                    ...traj,
                    currentNode: 'evaluate',
                    validation: {
                      errors: Array.isArray(event.data.errors) ? event.data.errors : [],
                      valid: Boolean(event.data.valid)
                    }
                  }
                };

              case 'evaluation':
                return {
                  ...msg,
                  trajectory: {
                    ...traj,
                    currentNode: event.data.result === 'accepted' ? 'final' : 'refine',
                    evaluation: {
                      result: String(event.data.result || ''),
                      iteration: Number(event.data.iteration || 0)
                    }
                  }
                };

              case 'refinement':
                return {
                  ...msg,
                  trajectory: {
                    ...traj,
                    currentNode: 'validate',
                    draft: String(event.data.draft || ''),
                    refinements: [
                      ...(traj.refinements || []),
                      {
                        draft: String(event.data.draft || ''),
                        iteration: Number(event.data.iteration || 1)
                      }
                    ]
                  }
                };

              case 'final':
                return {
                  ...msg,
                  content: String(event.data.prompt || ''),
                  trajectory: {
                    ...traj,
                    currentNode: 'final',
                    status: 'completed',
                    finalPrompt: String(event.data.prompt || '')
                  }
                };

              case 'error':
                return {
                  ...msg,
                  trajectory: {
                    ...traj,
                    status: 'error',
                    error: String(event.data.message || 'Agent 执行发生异常')
                  }
                };

              default:
                return msg;
            }
          })
        );
      },
      abortControllerRef.current.signal
    );

    setIsRunning(false);
    abortControllerRef.current = null;
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsRunning(false);
    }
  };

  // Skill Mode Label for image count
  const getSkillModeLabel = (count: number) => {
    if (count === 0) return { tag: 'T2VA', label: '文生视频模式 (0张参考图)' };
    if (count === 1) return { tag: 'I2VA', label: '首帧锚定模式 (Picture 1 首帧)' };
    if (count === 2) return { tag: 'FL2VA', label: '首尾帧插值 (Picture 1 ➔ Picture 2)' };
    return { tag: 'Ref2VA', label: `全参考重构模式 (${count}张多资产)` };
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[580px] w-full rounded-2xl border border-slate-800 bg-slate-950/80 shadow-2xl overflow-hidden backdrop-blur-md">
      {/* Top Status Bar */}
      <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-slate-800/80 bg-slate-900/60 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isRunning ? 'bg-amber-400' : 'bg-emerald-400'} opacity-75`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isRunning ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
          </span>
          <span className="font-semibold text-slate-200">LangGraph Agent 工作流</span>
          <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">(/api/agent/run · SSE 流式状态机)</span>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer active:scale-95"
            title="清空当前记录并开启全新分镜推演"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>开启新对话</span>
          </button>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-indigo-950/70 border border-indigo-700/40 text-indigo-300 hidden md:inline">
            MiniMax H3 规范 v2.0
          </span>
        </div>
      </div>

      {/* Chat Messages Stream Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-10 px-4 text-center max-w-xl mx-auto space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-xl shadow-indigo-950/50">
              <Sparkles className="w-8 h-8 text-indigo-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-100 tracking-tight">MiniMax H3 导演级分镜 Agent</h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-md">
                由 LangGraph 状态图工作流驱动。输入画面创意或上传参考图，系统将自动匹配技能、构建结构化分镜、严格校验切镜时间戳与声景规范。
              </p>
            </div>

            {/* Preset Inspiration Cards */}
            <div className="w-full space-y-2 text-left pt-2">
              <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5 px-1">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>点击快速开启动作与运镜灵感：</span>
              </div>
              <div className="grid grid-cols-1 gap-2.5">
                {DEFAULT_SUGGESTIONS.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSubmit(s.prompt)}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/90 hover:bg-indigo-950/50 border border-slate-800 hover:border-indigo-500/40 transition-all group cursor-pointer text-left shadow-sm"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-200 group-hover:text-indigo-200">{s.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/80 text-indigo-300 font-mono">
                          {s.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 group-hover:text-slate-300 leading-normal">{s.prompt}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 shrink-0 ml-3 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              {/* User Message Bubble */}
              {msg.role === 'user' && (
                <div className="max-w-[85%] md:max-w-[75%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-indigo-600 to-indigo-700 text-white p-4 shadow-lg space-y-3">
                  {msg.images && msg.images.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {msg.images.map((img, idx) => (
                        <div key={idx} className="relative group">
                          <img
                            src={img}
                            alt={`Ref ${idx + 1}`}
                            className="w-20 h-20 md:w-24 md:h-24 object-cover rounded-xl border border-white/20 shadow-md"
                          />
                          <span className="absolute bottom-1 left-1 bg-black/70 backdrop-blur-xs text-[10px] text-white px-1.5 py-0.5 rounded font-mono font-bold">
                            Picture {idx + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.content && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>}
                </div>
              )}

              {/* Assistant Message Bubble with Full LangGraph Trajectory */}
              {msg.role === 'assistant' && (
                <div className="w-full max-w-3xl rounded-2xl rounded-tl-sm border border-slate-800/90 bg-slate-900/90 text-slate-100 p-4 md:p-5 shadow-xl space-y-4">
                  {/* Agent Header / Intro */}
                  {msg.content && !msg.trajectory?.finalPrompt && (
                    <p className="text-sm text-slate-300 leading-relaxed">{msg.content}</p>
                  )}

                  {/* Trajectory Timeline Box */}
                  {msg.trajectory && (
                    <div className="space-y-3 rounded-xl bg-slate-950/70 border border-slate-800/80 p-3 md:p-4">
                      {/* Pipeline Stage Badges */}
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                          <Layers className="w-4 h-4 text-indigo-400" />
                          <span>Agent 运行流程轨迹</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] font-mono">
                          {msg.trajectory.status === 'running' && (
                            <span className="flex items-center gap-1 text-amber-400">
                              <RefreshCw className="w-3 h-3 animate-spin" /> 推演执行中
                            </span>
                          )}
                          {msg.trajectory.status === 'completed' && (
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" /> 流程已闭环
                            </span>
                          )}
                          {msg.trajectory.status === 'error' && (
                            <span className="flex items-center gap-1 text-red-400">
                              <AlertCircle className="w-3.5 h-3.5" /> 执行中断
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Step 1: Skill Discovery */}
                      {msg.trajectory.skill && (
                        <div className="flex items-start gap-2 text-xs p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <div className="mt-0.5 text-indigo-400">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div className="flex-1 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-200">1. 技能识别 (discover)</span>
                              <span className="px-2 py-0.5 rounded bg-indigo-900/60 border border-indigo-700/50 text-[10px] font-mono text-indigo-200">
                                {msg.trajectory.skill.name.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400">{msg.trajectory.skill.description}</p>
                          </div>
                        </div>
                      )}

                      {/* Step 2: Draft Generation */}
                      {msg.trajectory.draft && (
                        <div className="text-xs p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="text-emerald-400">
                                <CheckCircle2 className="w-4 h-4" />
                              </div>
                              <span className="font-semibold text-slate-200">2. 初稿生成 (generateDraft)</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleDraftExpand(msg.id)}
                              className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
                            >
                              <span>{expandedDrafts[msg.id] ? '收起草案' : '查看草案'}</span>
                              {expandedDrafts[msg.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>
                          </div>
                          {expandedDrafts[msg.id] && (
                            <pre className="p-2.5 bg-slate-950 rounded-lg text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap border border-slate-800">
                              {msg.trajectory.draft}
                            </pre>
                          )}
                        </div>
                      )}

                      {/* Step 3: Deterministic Validation */}
                      {msg.trajectory.validation && (
                        <div className="flex items-start gap-2 text-xs p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <div className={`mt-0.5 ${msg.trajectory.validation.valid ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {msg.trajectory.validation.valid ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-200">3. 语法与规范校验 (validateDraft)</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${msg.trajectory.validation.valid ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800'}`}>
                                {msg.trajectory.validation.valid ? 'PASSED (0 错误)' : `WARNING (${msg.trajectory.validation.errors.length} 项需修复)`}
                              </span>
                            </div>
                            {msg.trajectory.validation.valid ? (
                              <p className="text-[11px] text-slate-400">已严格满足镜头三元组、切镜时间戳（At HH:MM:SS.mmm）与声景分离标准。</p>
                            ) : (
                              <ul className="list-disc list-inside text-[11px] text-amber-300 space-y-0.5">
                                {msg.trajectory.validation.errors.map((err, i) => (
                                  <li key={i}>{err}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Step 4: Refinement / Evaluation Loop */}
                      {msg.trajectory.evaluation && (
                        <div className="flex items-start gap-2 text-xs p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                          <div className="mt-0.5 text-indigo-400">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div className="flex-1 space-y-0.5">
                            <span className="font-semibold text-slate-200">4. 评估与自审重构 (evaluate / refine)</span>
                            <p className="text-[11px] text-slate-400">
                              评估状态: <span className="font-mono text-indigo-300">{msg.trajectory.evaluation.result}</span>
                              {msg.trajectory.evaluation.iteration > 0 && ` · 迭代重构轮次: #${msg.trajectory.evaluation.iteration}`}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Error State Banner */}
                      {msg.trajectory.error && (
                        <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-xs text-red-200 space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-red-400">
                            <AlertCircle className="w-4 h-4" />
                            <span>服务异常</span>
                          </div>
                          <p className="font-mono whitespace-pre-wrap">{msg.trajectory.error}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Final Production Prompt Display */}
                  {msg.trajectory?.finalPrompt && (
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          生产就绪分镜 Prompt
                        </h4>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.trajectory!.finalPrompt!, msg.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-colors cursor-pointer border border-slate-700"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-400">已复制</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>复制</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onApplyPrompt(msg.trajectory!.finalPrompt!)}
                            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
                          >
                            <span>应用全部到生成页</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl bg-slate-950 p-3.5 border border-indigo-500/20">
                        <MarkdownRenderer content={msg.trajectory.finalPrompt} onApplyPrompt={onApplyPrompt} />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
                        <span>💡 提示：支持划选上方局部文本后点击快速回填</span>
                        <button
                          type="button"
                          onClick={() => {
                            const selected = document.getSelection()?.toString();
                            if (selected && selected.trim()) {
                              onApplyPrompt(selected.trim());
                            }
                          }}
                          className="text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                        >
                          应用选中文本到生成页
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Composer Box */}
      <div className="border-t border-slate-800 bg-slate-900/90 p-3 md:p-4 space-y-2.5">
        {/* Selected Images Preview Strip */}
        {selectedImages.length > 0 && (
          <div className="flex items-center gap-3 p-2 bg-slate-950/80 rounded-xl border border-slate-800 overflow-x-auto">
            {selectedImages.map((img, idx) => (
              <div key={idx} className="relative group shrink-0">
                <img
                  src={img}
                  alt={`Attachment ${idx + 1}`}
                  className="w-16 h-16 object-cover rounded-lg border border-slate-700 shadow"
                />
                <span className="absolute bottom-1 left-1 bg-black/80 text-[9px] text-white px-1 py-0.5 rounded font-mono font-bold">
                  Picture {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-500 text-white rounded-full p-0.5 shadow transition-colors cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <div className="text-xs text-indigo-300 font-mono px-2 shrink-0">
              {getSkillModeLabel(selectedImages.length).label}
            </div>
          </div>
        )}

        {/* Input Bar */}
        <div className="flex items-end gap-2">
          {/* Image Upload Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            accept="image/png, image/jpeg, image/webp"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="添加参考图片（支持首帧、首尾帧或多图资产）"
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer shrink-0 flex items-center justify-center"
          >
            <ImageIcon className="w-5 h-5" />
          </button>

          {/* Text Area */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={
                selectedImages.length > 0
                  ? `已添加 ${selectedImages.length} 张图片，请输入动作演化或场景描述... (Shift+Enter换行)`
                  : '描述你的视频想法（如镜头机位、动作演变、声效、配乐）... (Shift+Enter换行)'
              }
              rows={2}
              className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-500 transition-all font-body-base leading-relaxed"
            />
          </div>

          {/* Send / Stop Button */}
          {isRunning ? (
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <Square className="w-4 h-4 fill-white" />
              <span>停止</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={!inputPrompt.trim() && selectedImages.length === 0}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 shadow-md"
            >
              <Send className="w-4 h-4" />
              <span>推演</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

