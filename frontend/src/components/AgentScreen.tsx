import React, { useState, useRef, useEffect } from 'react';
import { AgentMessage } from '../types';
import { nativeReadLlmConfig } from '../utils/nativeBridge';

interface AgentScreenProps {
  onApplyPrompt: (prompt: string) => void;
}

const H3_SKILL_SYSTEM_PROMPT = `你是 MiniMax-H3 全模态视频生成模型的专业 Prompt 导师 (Prompt Engineer Agent)。
你的任务是将用户的简短创意或粗糙想法，按照 MiniMax-H3 官方技能库 (h3-prompt-writing skill) 的标准，构造成高水准、电影级的结构化提示词。

你的输出结构应当严格包含以下三大模块：
1. 【参考素材标注】(Reference Material Notes)：如有图片或音频输入，按 @image1, @image2, @audio1 等显式标明其角色（如人物造型、材质风格、背景音乐、动作参考）。
2. 【核心创意】(Core Idea)：一句话概括视频的主旨、氛围与故事悬念。
3. 【分镜场景描述】(Scene-by-Scene Description)：详细说明景别（特写/全景）、镜头运动（Pan, Tilt, Zoom in/out, Tracking shot, Dolly）、主体动作演变、光影色彩及音效对齐线索。

请保持专业、富有电影感和画面表现力。请以中文回复。`;

export const AgentScreen: React.FC<AgentScreenProps> = ({ onApplyPrompt }) => {
  const [messages, setMessages] = useState<AgentMessage[]>([
    {
      id: 'welcome-1',
      sender: 'agent',
      text: '你好！我是 MiniMax-H3 视频分镜与 Prompt 助手。告诉我你的创意想法，或者选择下方的技能模板，我将基于官方 Skill 规则为你打造电影级提示词。',
      timestamp: Date.now()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSendMessage = async (customPrompt?: string) => {
    const userQuery = (customPrompt || inputText).trim();
    if (!userQuery || isThinking) return;

    const userMsg: AgentMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: userQuery,
      timestamp: Date.now()
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInputText('');
    setIsThinking(true);

    const { apiKey, endpoint } = nativeReadLlmConfig();

    if (apiKey) {
      try {
        const response = await fetch(endpoint || 'https://api.minimax.chat/v1/text/chatcompletion_v2', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'abab6.5s-chat',
            messages: [
              { role: 'system', content: H3_SKILL_SYSTEM_PROMPT },
              ...messages.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
              { role: 'user', content: userQuery }
            ]
          })
        });

        const data = await response.json();
        const replyText = data?.choices?.[0]?.message?.content || data?.reply || '生成提示词失败，请检查 API Key 或网络。';
        
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
            text: `请求失败: ${err?.message || '网络连接超时'}。已启用本地 Skill 模版为您润色。`,
            timestamp: Date.now()
          }
        ]);
        simulateFallbackResponse(userQuery);
      } finally {
        setIsThinking(false);
      }
    } else {
      // Simulate local skill response if no API Key provided
      setTimeout(() => {
        simulateFallbackResponse(userQuery);
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
- 00:00 - 00:03: [超近特写] 镜头缓慢向前推入（Slow Dolly In），霓虹雨水顺着光滑表面滑落，色彩斑斓的光影交错。
- 00:03 - 00:08: [低角度跟随中景] 镜头以低角度跟随移动（Low-angle Tracking Shot），主体平滑运动，背景展现宏大的城市建筑，配合强烈的动感光束。
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
      camera: '帮我设计一段强调镜头运动（如环绕推镜头、低角度跟随）的 MiniMax-H3 电影级分镜描述。',
      audio: '帮我规划一段音画同步的视频 Prompt，要求明确环境音与背景音乐在不同时间点的线索。',
      cinematic: '增强以下场景的赛博朋克光影质感与视觉细节，使其符合 H3 模型的最佳渲染效果：',
      restructure: '请将我现有的简单想法按照【参考素材标注】、【核心创意】与【分镜场景描述】重新结构化：'
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
          <span className="material-symbols-outlined text-indigo-400">smart_toy</span>
          Prompt 助手 Agent
        </h1>
        <p className="text-slate-400 text-sm">
          基于 MiniMax-H3 官方 Skill 库，助你快速构思与重构电影级分镜提示词。
        </p>
      </div>

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
          <span className="material-symbols-outlined text-sm">auto_fix_high</span>
          🪄 结构化重构
        </button>
      </div>

      {/* Chat Messages Box */}
      <div className="flex-1 bg-slate-900/60 border border-slate-800 rounded-2xl p-4 overflow-y-auto space-y-4 max-h-[55vh] min-h-[350px]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none'
                  : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-bl-none font-body-base whitespace-pre-wrap'
              }`}
            >
              {msg.text}
            </div>
            {msg.sender === 'agent' && msg.id !== 'welcome-1' && (
              <button
                type="button"
                onClick={() => onApplyPrompt(msg.text)}
                className="mt-2 text-xs font-semibold px-3 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 flex items-center gap-1 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-xs">rocket_launch</span>
                🚀 一键填入生成页
              </button>
            )}
          </div>
        ))}

        {isThinking && (
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 p-3 rounded-xl border border-slate-800 w-fit">
            <span className="material-symbols-outlined text-indigo-400 animate-spin text-sm">sync</span>
            MiniMax Skill Agent 正在思考与构建分镜...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="描述你的想法，如“赛博朋克雨夜跑车”..."
          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/80"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isThinking}
          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-all flex items-center gap-1 cursor-pointer"
        >
          <span>发送</span>
          <span className="material-symbols-outlined text-sm">send</span>
        </button>
      </form>
    </main>
  );
};
