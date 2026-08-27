import React, { useState, useRef, useEffect } from 'react';
import { AgentMessage, MediaItem } from '../types';
import { nativeReadLlmConfig, nativePickMedia } from '../utils/nativeBridge';

interface AgentScreenProps {
  onApplyPrompt: (prompt: string) => void;
}

const H3_SKILL_SYSTEM_PROMPT = `你是 MiniMax-H3 全模态视频生成模型的专业 Prompt 导师 (Prompt Engineer Agent)。
你的任务是将用户的简短创意、粗糙想法或上传的参考图片，按照 MiniMax-H3 官方技能库 (h3-prompt-writing skill) 的标准，构造成高水准、电影级的结构化提示词。

如果你接收到了图片参考，请仔细分析图片中的角色设定、构图方式、光影材质与主体细节，并在【参考素材标注】中显式标明（如 @image1 代表第一张图片、@image2 代表第二张图片），将其融入到电影分镜描述中。

你的输出结构应当严格包含以下三大模块：
1. 【参考素材标注】(Reference Material Notes)：如有图片或音频输入，按 @image1, @image2, @audio1 等显式标明其角色（如人物造型、材质风格、背景音乐、动作参考）。
2. 【核心创意】(Core Idea)：一句话概括视频的主旨、氛围与故事悬念。
3. 【分镜场景描述】(Scene-by-Scene Description)：详细说明景别（特写/全景）、镜头运动（Pan, Tilt, Zoom in/out, Tracking shot, Dolly）、主体动作演变、光影色彩及音效对齐线索。

请保持专业、富有电影感和画面表现力。请以中文回复。`;

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
      text: '你好！我是 MiniMax-H3 视频分镜与 Prompt 助手。告诉我你的创意想法，或上传图片参考素材，我将为你打造电影级结构化提示词。',
      timestamp: Date.now()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [attachedImages, setAttachedImages] = useState<MediaItem[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

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

  const handleSendMessage = async (customPrompt?: string) => {
    const userQuery = (customPrompt || inputText).trim();
    if ((!userQuery && attachedImages.length === 0) || isThinking) return;

    const currentImages = attachedImages.map((img) => img.dataUri);
    const displayQuery = userQuery || (currentImages.length > 0 ? '（参考图片）' : '');

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
        const formattedMessages: any[] = [
          { role: 'system', content: H3_SKILL_SYSTEM_PROMPT }
        ];

        // Process past message history
        messages
          .filter((m) => m.id !== 'welcome-1' && !m.text.startsWith('❌'))
          .forEach((m) => {
            if (m.images && m.images.length > 0) {
              const contentArr: any[] = [{ type: 'text', text: m.text }];
              m.images.forEach((imgUri) => {
                contentArr.push({
                  type: 'image_url',
                  image_url: { url: imgUri }
                });
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

        // Append current new message
        if (currentImages.length > 0) {
          const contentArr: any[] = [{ type: 'text', text: displayQuery }];
          currentImages.forEach((imgUri) => {
            contentArr.push({
              type: 'image_url',
              image_url: { url: imgUri }
            });
          });
          formattedMessages.push({ role: 'user', content: contentArr });
        } else {
          formattedMessages.push({ role: 'user', content: displayQuery });
        }

        const response = await fetch(effectiveEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model || 'abab6.5s-chat',
            messages: formattedMessages
          })
        });

        // STREAM SAFE READ: Read raw text first into memory to prevent body stream locked error
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
          throw new Error(
            `HTTP ${response.status} ${response.statusText}${
              errDetail ? `: ${errDetail}` : ''
            }`
          );
        }

        let data: any = {};
        try {
          data = JSON.parse(rawText);
        } catch {
          throw new Error('服务响应 200 OK，但未返回有效的 JSON 数据。');
        }

        const replyText =
          data?.choices?.[0]?.message?.content ||
          data?.reply ||
          (typeof data?.choices?.[0]?.text === 'string'
            ? data.choices[0].text
            : '');

        if (!replyText) {
          throw new Error(
            'API 返回成功，但未能解析出文本。请确认模型名称与 Endpoint 兼容性。'
          );
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `agent-${Date.now()}`,
            sender: 'agent',
            text: replyText,
            timestamp: Date.now()
          }
        ]);
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            id: `agent-err-${Date.now()}`,
            sender: 'agent',
            text: `❌ 请求 LLM 失败: ${err?.message || '网络连接超时'}\n\n请求地址: \`${effectiveEndpoint}\`\n建议检查【系统设置】中的 API Key、Endpoint 与 Model 名称是否正确。`,
            timestamp: Date.now()
          }
        ]);
      } finally {
        setIsThinking(false);
      }
    } else {
      // Simulate local skill response if no API Key provided
      setTimeout(() => {
        simulateFallbackResponse(displayQuery);
        setIsThinking(false);
      }, 1000);
    }
  };

  const simulateFallbackResponse = (query: string) => {
    const simulatedText = `【参考素材标注】
@image1: 角色造型与服装材质参考。
@audio1: 背景情绪配乐与环境音效线索。

【核心创意】
展现“${query}”的赛博朋克电影质感与强烈的视觉张力。

【分镜场景描述】
- 00:00 - 00:03: [超近特写] 镜头缓慢向前推入（Slow Dolly In），霓虹雨效滑落，色彩斑斓的光影交错。
- 00:03 - 00:08: [低角度跟随中景] 镜头以低角度跟随移动（Low-angle Tracking Shot），主体平滑运动，背景展现宏大建筑与光束。
- 音画线索: 音效随着镜头近推呈现明显的声场包裹感。`;

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
      camera:
        '帮我设计一段强调镜头运动（如环绕推镜头、低角度跟随）的 MiniMax-H3 电影级分镜描述。',
      audio:
        '帮我规划一段音画同步的视频 Prompt，要求明确环境音与背景音乐在不同时间点的线索。',
      cinematic:
        '增强以下场景的赛博朋克光影质感与视觉细节，使其符合 H3 模型的最佳渲染效果：',
      restructure:
        '请将我现有的简单想法按照【参考素材标注】、【核心创意】与【分镜场景描述】重新结构化：'
    };
    const prefix = textMap[skillType] || '请优化这个 Prompt：';
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
          Prompt 助手 Agent (Vision 多模态)
        </h1>
        <p className="text-slate-400 text-sm">
          基于 MiniMax-H3 官方 Skill 库，支持图文多模态分析，助你打造电影级提示词。
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
                  当前未配置 LLM API Key，Prompt 助手处于演示/模拟模式。请前往【系统设置】配置 API Key 以体验真实大模型。
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
          onClick={() => handleQuickSkill('camera')}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">videocam</span>
          🎬 镜头语言规划
        </button>
        <button
          type="button"
          onClick={() => handleQuickSkill('audio')}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">graphic_eq</span>
          🎵 音画同步线索
        </button>
        <button
          type="button"
          onClick={() => handleQuickSkill('cinematic')}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">movie_filter</span>
          🎨 电影质感增强
        </button>
        <button
          type="button"
          onClick={() => handleQuickSkill('restructure')}
          className="whitespace-nowrap px-3 py-1.5 rounded-lg border border-indigo-500/30 text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">
            auto_fix_high
          </span>
          🪄 结构化重构
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
                  : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-none font-body-base whitespace-pre-wrap'
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
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 p-3 rounded-xl border border-slate-800 w-fit">
            <span className="material-symbols-outlined text-indigo-400 animate-spin text-sm">
              sync
            </span>
            MiniMax Skill Agent 正在思考与构建分镜...
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
