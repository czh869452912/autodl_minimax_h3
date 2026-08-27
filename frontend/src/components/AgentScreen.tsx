import React, { useState, useRef, useEffect } from 'react';
import { AgentMessage, MediaItem } from '../types';
import { nativeReadLlmConfig, nativePickMedia } from '../utils/nativeBridge';
import { MarkdownRenderer } from './MarkdownRenderer';
import { runH3AgentHarness } from '../agent/h3AgentHarness';

interface AgentScreenProps {
  onApplyPrompt: (prompt: string) => void;
}

const H3_HARNESS_SYSTEM_PROMPT = `你是 MiniMax-H3 全模态视频生成模型的官方 Skill Harness Agent。
你的任务是将用户的文本创意或参考图片，依据注册的 H3 技能工具库 (t2vaSkill, i2vaSkill, fl2vaSkill, ref2vaSkill) 及自主 Self-Refine 机制，构造成高水准、符合模型解析特性的结构化提示词。

【Agent Harness 选型与 Skill 调用流程】
1. 观察用户意图与素材：
   - 0 张图 / 纯文本 ➔ 优先选择 t2vaSkill。
   - 1 张图 ➔ 优先选择 i2vaSkill（设置 Picture 1 首帧锚定与向前推演）。
   - 2 张图 ➔ 优先选择 fl2vaSkill（建立 Picture 1 与 Picture 2 的平滑插值）。
   - 3+ 张图 / 多要素素材 ➔ 优先选择 ref2vaSkill（采用 6 Section 格式：subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music）。
2. 执行初步 Skill 推演后，必须自主调用 auditAndRefineSkill 校验时间戳切分 ([Shot 2] At 00:03.500)、镜头运动三要素 (类型, 幅度, 速度) 与双声道隔绝。
3. 最终呈献经过 Harness 校验的完整 Markdown 格式提示词。`;

export const AgentScreen: React.FC<AgentScreenProps> = ({ onApplyPrompt }) => {
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'welcome-1',
      sender: 'agent',
      text: '你好！我是 MiniMax-H3 官方 Agent Harness。基于 Vercel AI SDK 驱动，可自主根据用户输入匹配 H3 Skill 工具库并进行多阶段 Tool Loop 校验推演！',
      timestamp: Date.now()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [attachedImages, setAttachedImages] = useState<MediaItem[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [harnessProgress, setHarnessProgress] = useState<{ step: string; detail?: string } | null>(null);
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

    if (apiKey) {
      try {
        setHarnessProgress({ step: 'Agent Harness 启动中', detail: '加载 H3 Skill 工具库...' });

        const finalOutputText = await runH3AgentHarness({
          apiKey,
          endpoint,
          modelName: model,
          systemPrompt: H3_HARNESS_SYSTEM_PROMPT,
          userPrompt: displayQuery,
          images: currentImages,
          maxSteps: 5,
          onStepProgress: (step, detail) => {
            setHarnessProgress({ step, detail });
          }
        });

        setMessages((prev) => [
          ...prev,
          {
            id: `agent-${Date.now()}`,
            sender: 'agent',
            text: finalOutputText,
            timestamp: Date.now()
          }
        ]);
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            id: `agent-err-${Date.now()}`,
            sender: 'agent',
            text: `❌ Vercel AI SDK Agent Harness 运行异常: ${err?.message || '网络连接超时'}\n\n建议检查【系统设置】中的 API Key 与 Model 配置。`,
            timestamp: Date.now()
          }
        ]);
      } finally {
        setHarnessProgress(null);
        setIsThinking(false);
      }
    } else {
      // Demo Harness mode simulation
      setHarnessProgress({ step: 'Agent 观察场景特征', detail: '匹配 H3 Skill 工具...' });
      setTimeout(() => {
        setHarnessProgress({ step: 'Agent 触发 Tool Call', detail: '关联工具执行数据合成...' });
        setTimeout(() => {
          setHarnessProgress({ step: 'Agent 触发 auditAndRefineSkill', detail: 'Self-Refine 校验与高亮输出...' });
          setTimeout(() => {
            simulateFallbackResponse(displayQuery, currentImages.length);
            setHarnessProgress(null);
            setIsThinking(false);
          }, 600);
        }, 600);
      }, 600);
    }
  };

  const simulateFallbackResponse = (query: string, imgCount: number) => {
    let modeTag = 't2vaSkill (纯文本转视频音效)';
    let headerInstruction = '';

    if (imgCount === 1) {
      modeTag = 'i2vaSkill (首帧生成模式)';
      headerInstruction = 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\n';
    } else if (imgCount === 2) {
      modeTag = 'fl2vaSkill (首尾帧间插模式)';
      headerInstruction = 'How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 2) aligns with the 5.00-second mark of the target video.\n\n';
    } else if (imgCount > 2) {
      modeTag = 'ref2vaSkill (全要素参考 6 Section 模式)';
    }

    let simulatedText = '';

    if (imgCount > 2) {
      simulatedText = `🎯 [H3 Agent Harness Audit Certified]

*Agent Autonomously Executed Tool*: \`${modeTag}\`

\`\`\`text
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
Deep synth-wave pulse building emotional tension towards the end.
\`\`\``;
    } else {
      simulatedText = `🎯 [H3 Agent Harness Audit Certified]

*Agent Autonomously Executed Tool*: \`${modeTag}\`

\`\`\`text
${headerInstruction}integrated_multimodal_description: [Shot 1] Live-action, cinematic, slow dolly-in medium shot capturing the scene of "${query}". Character and light composition gradually intensify. [Shot 2] At 00:03.500, the shot cuts to a low-angle tracking shot following the main subject smooth motion.

overall_soundscape: Ambient environmental sound, realistic physical motion acoustics, and crisp subtle details.

non_diegetic_music: Cinematic ambient music with subtle synthesizer chords elevating tension.
\`\`\``;
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
      t2va: '请调用 t2vaSkill 为我生成纯文本多镜头与音画分轨提示词：',
      i2va: '请调用 i2vaSkill 为我上传的首帧图构建向前演变的视频提示词：',
      fl2va: '请调用 fl2vaSkill 为我构建首尾两张参考图之间的平滑过渡分镜：',
      ref2va: '请调用 ref2vaSkill 为上传的多张素材构建 6-Section 全要素 Prompt：'
    };
    const prefix = textMap[skillType] || '请使用 Agent Harness 优化该提示词：';
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
          Agent Harness Studio (Vercel AI SDK)
        </h1>
        <p className="text-slate-400 text-sm">
          基于标准 Agent Harness 驱动，自主路由 MiniMax-H3 Skill 工具库，搭配 Markdown 渲染与框内一键复制。
        </p>
      </div>

      {/* Status Warning / Connection Badge Banner */}
      {(() => {
        const { apiKey, endpoint, model } = nativeReadLlmConfig();
        if (!apiKey) {
          return (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-400 text-base">
                  warning
                </span>
                <span>
                  当前未配置 LLM API Key，Agent Harness 运行于演示/模拟模式。配置 API Key 后可进行标准 API Tool Call 推演。
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
                Agent Harness 已就绪 (模型: <strong className="font-mono text-indigo-200">{model || 'abab6.5s-chat'}</strong>)
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
          🎬 t2vaSkill
        </button>
        <button
          type="button"
          onClick={() => handleQuickSkill('i2va')}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">image</span>
          🖼️ i2vaSkill
        </button>
        <button
          type="button"
          onClick={() => handleQuickSkill('fl2va')}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">view_carousel</span>
          🎞️ fl2vaSkill
        </button>
        <button
          type="button"
          onClick={() => handleQuickSkill('ref2va')}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">theater_comedy</span>
          🎭 ref2vaSkill
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
                  : 'bg-slate-900/90 text-slate-200 border border-slate-800 rounded-bl-none w-full'
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
              {msg.sender === 'agent' ? (
                <MarkdownRenderer content={msg.text} onApplyPrompt={onApplyPrompt} />
              ) : (
                msg.text
              )}
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
          <div className="flex flex-col gap-2 p-3.5 bg-slate-900/90 rounded-xl border border-indigo-500/40 shadow-lg text-xs w-full max-w-md">
            <div className="flex items-center gap-2 text-indigo-300 font-semibold">
              <span className="material-symbols-outlined text-indigo-400 animate-spin text-base">
                sync
              </span>
              <span>{harnessProgress?.step || 'Agent Harness 思考中...'}</span>
            </div>
            {harnessProgress?.detail && (
              <div className="text-[11px] font-mono text-indigo-300/80 bg-slate-950/60 p-2 rounded border border-slate-800 truncate">
                {harnessProgress.detail}
              </div>
            )}
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
