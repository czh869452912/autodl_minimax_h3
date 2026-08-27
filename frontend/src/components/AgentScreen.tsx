import React, { useState, useRef, useEffect } from 'react';
import { AgentMessage, MediaItem } from '../types';
import { nativeReadLlmConfig, nativePickMedia } from '../utils/nativeBridge';

interface AgentScreenProps {
  onApplyPrompt: (prompt: string) => void;
}

const H3_SKILL_SYSTEM_PROMPT = `你是 MiniMax-H3 全模态视频生成模型的官方 Skill 导师 Agent (Prompt Engineer)。
你的任务是将用户的文本创意或参考图片，严格遵循 GitHub 官方 MiniMax-AI/MiniMax-H3 (h3-prompt-writing skill) 规范，构造成高水准、符合模型解析特性的结构化提示词。

【模式自动判断与首行指令规范】
1. T2VA (纯文本转视频音效)：无图片参考。无首行对齐指令，直接输出三大核心字段。
2. I2VA (首帧图文生成)：有 1 张参考图作为首帧。第一行指令严格使用：
   For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.
3. FL2VA (首尾帧间插)：有 2 张参考图（Picture 1 为 0.00s 首帧，Picture 2 为 S.SSs 尾帧）。第一行指令严格使用：
   How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the S.SS-second mark of the target video.
4. Ref2VA (全要素/多图多素材模式)：多张主体/风格/音效参考时，采用官方 6 Section 格式：
   - subject_definitions: 定义 <Subject 1>, <Picture 1>, <Audio 1> 等
   - summary: [reference generation] ... 概要
   - retention_analysis: 迁移与保留分析
   - detailed_description: [Shot 1] ... [Shot 2] At 00:03.500 ...
   - overall_soundscape: 环境音与物理动作音效
   - non_diegetic_music: 观众听到的背景音乐

【核心分镜与镜头切分规范】
- 镜头切分：[Shot 1] 开头不含时间戳。[Shot 2] 及后续镜头必须标注严格递增切分点，如 [Shot 2] At 00:03.500, the camera cuts to...
- 镜头运动：描述三要素——运动类型 (Pan, Dolly, Tracking, Zoom) + 幅度 + 速度 (如 slow, steady, rapid)。
- 音频分轨：区分场景内物理音效 (overall_soundscape) 与非场景背景乐 (non_diegetic_music)。

请以中文撰写分析与说明，提示词核心结构保留官方标准格式。`;

const H3_AUDIT_SYSTEM_PROMPT = `你是 MiniMax-H3 官方规范的代码级 Self-Refine Audit 专家。
你的任务是对上一轮生成的 H3 Prompt 草案进行严格的规范审计与二次精雕重构：

【审计与校准清单】
1. 模式指令匹配：检查 I2VA/FL2VA/Ref2VA 首行指令与参考素材对齐格式是否精准无误。
2. 时间轴切分：检查 [Shot N] 后的时间戳格式（如 At 00:03.500）是否严密且递增。
3. 镜头语言强化：确认镜头运动包含了类型、幅度与速度，增强画面电影质感。
4. 音画分轨严密性：场景音效与 BGM 是否彻底隔离。

请完成重构，输出带有【H3 Skill Agent Multi-Pass Validated】校验标记的高质量最终 Prompt 方案。`;

const getEffectiveEndpoint = (ep: string): string => {
  let target = (ep || '').trim();
  if (!target) return 'https://api.minimax.chat/v1/text/chatcompletion_v2';
  target = target.replace(/\/+$/, '');
  // Auto-append /chat/completions if endpoint is OpenAI base URL without chat path
  if (
    !target.endsWith('/chat/completions') &&
    !target.endsWith('/chatcompletion_v2') &&
    !target.endsWith('/completions')
  ) {
    if (target.endsWith('/v1')) {
      target += '/chat/completions';
    } else {
      target += '/v1/chat/completions';
    }
  }
  return target;
};

export const AgentScreen: React.FC<AgentScreenProps> = ({ onApplyPrompt }) => {
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'welcome-1',
      sender: 'agent',
      text: '你好！我是 MiniMax-H3 官方技能库 Agent。现已集成多 Pass 迭代与 Self-Refine 机制，支持 T2VA、I2VA、FL2VA 及 Ref2VA 多模态全模式场景推演！',
      timestamp: Date.now()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [attachedImages, setAttachedImages] = useState<MediaItem[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingStep, setThinkingStep] = useState<'analyzing' | 'drafting' | 'refining' | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking, thinkingStep]);

  // Handle native media pick callback
  useEffect(() => {
    window.onMediaPicked = (mediaJson: string) => {
      try {
        const item: MediaItem = JSON.parse(mediaJson);
        if (item.kind === 'image') {
          setAttachedImages((prev) => {
            if (prev.length >= 4) {
              alert('最多只能添加 4 张参考图');
              return prev;
            }
            return [...prev, item];
          });
        }
      } catch (err) {
        console.error('Failed to parse picked media:', err);
      }
    };
    return () => {
      delete window.onMediaPicked;
    };
  }, []);

  const handleSelectWebImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (attachedImages.length >= 4) {
      alert('最多只能添加 4 张参考图片');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('单张图片不能超过 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const item: MediaItem = {
        id: `img-${Date.now()}-${Math.random()}`,
        kind: 'image',
        name: file.name,
        mime: file.type || 'image/png',
        size: file.size,
        dataUri: reader.result as string
      };
      setAttachedImages((prev) => [...prev, item]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handlePickImage = () => {
    if (attachedImages.length >= 4) {
      alert('最多只能添加 4 张参考图片');
      return;
    }
    if (window.AndroidBridge?.pickMedia) {
      nativePickMedia('image');
    } else {
      document.getElementById('agent-img-input')?.click();
    }
  };

  const handleRemoveImage = (id: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
  };

  // Helper for single LLM fetch step
  const executeLlmStep = async (
    endpoint: string,
    apiKey: string,
    modelName: string,
    systemPrompt: string,
    userContent: any
  ): Promise<string> => {
    const formattedMessages: any[] = [{ role: 'system', content: systemPrompt }];

    // Build context history
    messages
      .filter((m) => m.id !== 'welcome-1' && !m.text.startsWith('❌'))
      .forEach((m) => {
        if (m.images && m.images.length > 0) {
          const contentArr: any[] = [{ type: 'text', text: m.text }];
          m.images.forEach((imgUri) => {
            contentArr.push({ type: 'image_url', image_url: { url: imgUri } });
          });
          formattedMessages.push({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: contentArr
          });
        } else {
          formattedMessages.push({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text
          });
        }
      });

    formattedMessages.push({ role: 'user', content: userContent });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName || 'abab6.5s-chat',
        messages: formattedMessages
      })
    });

    const rawText = await response.text();
    if (!response.ok) {
      let errDetail = rawText;
      try {
        const errJson = JSON.parse(rawText);
        errDetail =
          errJson?.error?.message ||
          errJson?.base_resp?.status_msg ||
          errJson?.msg ||
          errDetail;
      } catch {}
      throw new Error(`HTTP ${response.status} ${response.statusText}${errDetail ? `: ${errDetail}` : ''}`);
    }

    let data: any = {};
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error('服务响应 200 OK，但未返回有效的 JSON 数据。');
    }

    const reply =
      data?.choices?.[0]?.message?.content ||
      data?.reply ||
      (typeof data?.choices?.[0]?.text === 'string' ? data.choices[0].text : '');

    if (!reply) throw new Error('API 返回成功但无法解析出文本。');
    return reply;
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const userQuery = (customPrompt || inputText).trim();
    if ((!userQuery && attachedImages.length === 0) || isThinking) return;

    const currentImages = attachedImages.map((img) => img.dataUri);
    const displayQuery = userQuery || (currentImages.length > 0 ? '（参考图片分析）' : '');

    const userMsg: AgentMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: displayQuery,
      images: currentImages.length > 0 ? currentImages : undefined,
      timestamp: Date.now()
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInputText('');
    setAttachedImages([]);
    setIsThinking(true);

    const { apiKey, endpoint, model } = nativeReadLlmConfig();
    const effectiveEndpoint = getEffectiveEndpoint(endpoint);

    if (apiKey) {
      try {
        // Prepare user input payload with optional vision
        let userContent: any = displayQuery;
        if (currentImages.length > 0) {
          const contentArr: any[] = [{ type: 'text', text: displayQuery }];
          currentImages.forEach((imgUri) => {
            contentArr.push({ type: 'image_url', image_url: { url: imgUri } });
          });
          userContent = contentArr;
        }

        // --- PASS 1: Mode Selection & Initial H3 Draft ---
        setThinkingStep('analyzing');
        const pass1Draft = await executeLlmStep(
          effectiveEndpoint,
          apiKey,
          model,
          H3_SKILL_SYSTEM_PROMPT,
          userContent
        );

        // --- PASS 2: Self-Refine Audit & Final Formatting ---
        setThinkingStep('refining');
        const auditInput = `【初步分镜草案与规则匹配】:\n${pass1Draft}\n\n请针对 MiniMax-H3 官方规范执行 Self-Refine 精焦校验，生成最终高质量格式化提示词。`;

        const finalReplyText = await executeLlmStep(
          effectiveEndpoint,
          apiKey,
          model,
          H3_AUDIT_SYSTEM_PROMPT,
          auditInput
        );

        setMessages((prev) => [
          ...prev,
          {
            id: `agent-${Date.now()}`,
            sender: 'agent',
            text: finalReplyText,
            timestamp: Date.now()
          }
        ]);
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            id: `agent-err-${Date.now()}`,
            sender: 'agent',
            text: `❌ 请求 Agent Loop 失败: ${err?.message || '网络连接超时'}\n\n请求地址: \`${effectiveEndpoint}\`\n建议检查【系统设置】中的 API Key、Endpoint 与 Model 名称是否正确。`,
            timestamp: Date.now()
          }
        ]);
      } finally {
        setThinkingStep(null);
        setIsThinking(false);
      }
    } else {
      // Multi-step simulation in demo mode
      setThinkingStep('analyzing');
      setTimeout(() => {
        setThinkingStep('drafting');
        setTimeout(() => {
          setThinkingStep('refining');
          setTimeout(() => {
            simulateFallbackResponse(displayQuery, currentImages.length);
            setThinkingStep(null);
            setIsThinking(false);
          }, 600);
        }, 600);
      }, 600);
    }
  };

  const simulateFallbackResponse = (query: string, imgCount: number) => {
    let modeTag = 'T2VA (纯文本转视频音效)';
    let headerInstruction = '';

    if (imgCount === 1) {
      modeTag = 'I2VA (首帧生成模式)';
      headerInstruction = 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\n';
    } else if (imgCount === 2) {
      modeTag = 'FL2VA (首尾帧间插模式)';
      headerInstruction = 'How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 2) aligns with the 5.00-second mark of the target video.\n\n';
    } else if (imgCount > 2) {
      modeTag = 'Ref2VA (全要素参考 6 Section 模式)';
    }

    let simulatedText = '';

    if (imgCount > 2) {
      simulatedText = `🎯 [H3 Skill Agent Multi-Pass Validated]
模式判定: ${modeTag}

subject_definitions:
- <Subject 1> is the main character from <Picture 1>, with detailed attire and visual features.
- <Picture 1> is the visual style and composition anchor for [Shot 1].
- <Picture 2> is the character action reference.

summary:
[reference generation] Movie scene based on "${query}" with cinema lighting and multi-shot pacing.

retention_analysis:
<Subject 1>'s costume and visual identity are fully preserved across all shots.

detailed_description:
[Shot 1] Live-action, cinematic, a slow dolly-in shot frames <Subject 1> in a neon-lit rain scene.
[Shot 2] At 00:03.500, the shot cuts to a low-angle tracking shot, following movement with dynamic focus.

overall_soundscape:
Heavy rain patter, footstep acoustics on wet pavement, distant cyberpunk city rumble.

non_diegetic_music:
Deep synth-wave pulse building emotional tension towards the end.`;
    } else {
      simulatedText = `🎯 [H3 Skill Agent Multi-Pass Validated]
模式判定: ${modeTag}

${headerInstruction}integrated_multimodal_description: [Shot 1] Live-action, cinematic, slow dolly-in medium shot capturing the scene of "${query}". Character and light composition gradually intensify. [Shot 2] At 00:03.500, the shot cuts to a low-angle tracking shot following the main subject smooth motion.

overall_soundscape: Ambient environmental sound, realistic physical motion acoustics, and crisp subtle details.

non_diegetic_music: Cinematic ambient music with subtle synthesizer chords elevating tension.`;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `agent-fallback-${Date.now()}`,
        sender: 'agent',
        text: simulatedText,
        timestamp: Date.now()
      }
    ]);
  };

  const handleQuickSkill = (skillType: string) => {
    const textMap: Record<string, string> = {
      t2va:
        '请基于以下想法，按照 MiniMax-H3 官方 T2VA 规范构建多镜头切分与双声道音画分轨：',
      i2va:
        '请针对上传的首帧参考图，按 H3 官方 I2VA 规范建立 Picture 1 锚定指令并向前推演动作：',
      fl2va:
        '请针对首尾两张参考图，按 H3 官方 FL2VA 规范建立 Picture 1 与 Picture 2 的平滑插值路径：',
      ref2va:
        '请针对上传的多张素材，按 H3 官方 Ref2VA 6-Section 格式（subject_definitions, detailed_description 等）重构全要素分镜：'
    };
    const prefix = textMap[skillType] || '请按 H3 官方规范优化这个 Prompt：';
    if (inputText.trim()) {
      handleSendMessage(`${prefix} "${inputText.trim()}"`);
    } else {
      setInputText(prefix);
    }
  };

  return (
    <main className="pt-24 px-4 md:px-8 max-w-4xl mx-auto space-y-4 pb-28 min-h-screen flex flex-col">
      {/* Title Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-100 tracking-tight mb-1 flex items-center gap-2">
          <span className="material-symbols-outlined text-indigo-400">
            smart_toy
          </span>
          Prompt 助手 Agent Loop (MiniMax-H3 Skill)
        </h1>
        <p className="text-slate-400 text-sm">
          装载 GitHub 官方 <code className="text-indigo-300 bg-indigo-950/60 px-1.5 py-0.5 rounded font-mono">MiniMax-AI/MiniMax-H3</code> 技能库，支持 T2VA / I2VA / FL2VA / Ref2VA 多 Pass 自动推演与 Self-Refine 校准。
        </p>
      </div>

      {/* Status Warning / Connection Badge Banner */}
      {(() => {
        const { apiKey, endpoint, model } = nativeReadLlmConfig();
        const effective = getEffectiveEndpoint(endpoint);
        if (!apiKey) {
          return (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-base">
                  warning
                </span>
                <span>
                  当前未配置 LLM API Key，Prompt 助手处于 Agent Loop 演示模式。可前往【系统设置】配置 Key 以对接实时大模型。
                </span>
              </div>
            </div>
          );
        }
        return (
          <div className="px-3 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-300 text-xs flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-indigo-400 text-base">
                check_circle
              </span>
              <span>
                已连接 AI 模型:{' '}
                <strong className="font-mono text-indigo-200">
                  {model || 'abab6.5s-chat'}
                </strong>{' '}
                <span className="text-[10px] text-indigo-400/80">({effective})</span>
              </span>
            </div>
          </div>
        );
      })()}

      {/* Quick Skill Action Chips */}
      <div className="flex overflow-x-auto hide-scrollbar gap-2 py-1">
        <button
          type="button"
          onClick={() => handleQuickSkill('t2va')}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">movie</span>
          🎬 T2VA 纯文本
        </button>
        <button
          type="button"
          onClick={() => handleQuickSkill('i2va')}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">image</span>
          🖼️ I2VA 首帧演变
        </button>
        <button
          type="button"
          onClick={() => handleQuickSkill('fl2va')}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">view_carousel</span>
          🎞️ FL2VA 首尾帧
        </button>
        <button
          type="button"
          onClick={() => handleQuickSkill('ref2va')}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">theater_comedy</span>
          🎭 Ref2VA 全要素 6 Section
        </button>
      </div>

      {/* Chat Messages Box */}
      <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 overflow-y-auto space-y-4 max-h-[55vh] min-h-[350px]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.sender === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none'
                  : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-none font-mono whitespace-pre-wrap text-xs'
              }`}
            >
              {/* Image Previews inside message bubble */}
              {msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {msg.images.map((imgUri, idx) => (
                    <img
                      key={idx}
                      src={imgUri}
                      alt={`ref-${idx}`}
                      className="w-16 h-16 object-cover rounded-lg border border-indigo-400/40 shadow-sm"
                    />
                  ))}
                </div>
              )}
              {msg.text}
            </div>
            {msg.sender === 'agent' && msg.id !== 'welcome-1' && (
              <button
                type="button"
                onClick={() => onApplyPrompt(msg.text)}
                className="mt-2 text-xs font-semibold px-3 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 flex items-center gap-1 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-xs">
                  rocket_launch
                </span>
                🚀 一键填入生成页
              </button>
            )}
          </div>
        ))}

        {isThinking && (
          <div className="flex flex-col gap-2.5 p-3.5 bg-slate-900/90 rounded-xl border border-indigo-500/40 shadow-lg text-xs w-full max-w-md">
            <div className="flex items-center gap-2 text-indigo-300 font-semibold">
              <span className="material-symbols-outlined text-indigo-400 animate-spin text-base">
                sync
              </span>
              <span>MiniMax-H3 Agent Loop 多阶段推演中...</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div
                className={`p-2 rounded-lg border text-center transition-all flex flex-col items-center gap-1 ${
                  thinkingStep === 'analyzing'
                    ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200 animate-pulse font-semibold shadow-sm'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400'
                }`}
              >
                <span>🔍 Step 1</span>
                <span>模式识别</span>
              </div>
              <div
                className={`p-2 rounded-lg border text-center transition-all flex flex-col items-center gap-1 ${
                  thinkingStep === 'drafting'
                    ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200 animate-pulse font-semibold shadow-sm'
                    : thinkingStep === 'refining'
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-medium'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400'
                }`}
              >
                <span>📝 Step 2</span>
                <span>分镜构形</span>
              </div>
              <div
                className={`p-2 rounded-lg border text-center transition-all flex flex-col items-center gap-1 ${
                  thinkingStep === 'refining'
                    ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200 animate-pulse font-semibold shadow-sm'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400'
                }`}
              >
                <span>🪄 Step 3</span>
                <span>Self-Refine 校准</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Attached Images Preview Row */}
      {attachedImages.length > 0 && (
        <div className="flex gap-2 p-2 bg-slate-900/80 border border-slate-800 rounded-xl overflow-x-auto">
          {attachedImages.map((img) => (
            <div key={img.id} className="relative group flex-shrink-0">
              <img
                src={img.dataUri}
                alt={img.name}
                className="w-12 h-12 object-cover rounded-lg border border-indigo-500/40"
              />
              <button
                type="button"
                onClick={() => handleRemoveImage(img.id)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-600 hover:bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center cursor-pointer shadow-md"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Box Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="flex gap-2"
      >
        <button
          type="button"
          onClick={handlePickImage}
          title="添加参考图片（最多4张）"
          className="p-3 bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800 text-slate-400 hover:text-indigo-400 rounded-xl transition-all cursor-pointer flex items-center justify-center"
        >
          <span className="material-symbols-outlined text-lg">
            add_photo_alternate
          </span>
        </button>
        <input
          id="agent-img-input"
          type="file"
          accept="image/*"
          onChange={handleSelectWebImage}
          className="hidden"
        />
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="描述你的想法，或上传图片参考素材..."
          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/80"
        />
        <button
          type="submit"
          disabled={(!inputText.trim() && attachedImages.length === 0) || isThinking}
          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-all flex items-center gap-1 cursor-pointer"
        >
          <span>发送</span>
          <span className="material-symbols-outlined text-sm">send</span>
        </button>
      </form>
    </main>
  );
};
