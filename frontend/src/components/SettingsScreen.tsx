import React, { useState } from 'react';
import { AppSettings } from '../types';
import {
  nativeSaveToken,
  nativeReadToken,
  nativeSaveLlmConfig,
  nativeReadLlmConfig,
  nativeSaveAgentRuntimeUrl,
  nativeReadAgentRuntimeUrl,
} from '../utils/nativeBridge';

interface SettingsScreenProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const [token, setToken] = useState(nativeReadToken() || settings.token || '');
  
  const initialLlm = nativeReadLlmConfig();
  const [llmApiKey, setLlmApiKey] = useState(initialLlm.apiKey || settings.llmApiKey || '');
  const [llmEndpoint, setLlmEndpoint] = useState(initialLlm.endpoint || settings.llmEndpoint || 'https://api.minimax.chat/v1/text/chatcompletion_v2');
  const [llmModel, setLlmModel] = useState(initialLlm.model || settings.llmModel || 'abab6.5s-chat');
  const [runtimeUrl, setRuntimeUrl] = useState(settings.runtimeUrl || nativeReadAgentRuntimeUrl());

  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleSaveAutoDLToken = () => {
    nativeSaveToken(token.trim());
    onUpdateSettings({ token: token.trim() });
    showToast(token.trim() ? 'AutoDL ComfyUI Token 已通过 Android Keystore 加密保存' : '已清除 Token');
  };

  const handleSaveLlmConfig = () => {
    nativeSaveLlmConfig(llmApiKey.trim(), llmEndpoint.trim(), llmModel.trim());
    onUpdateSettings({ llmApiKey: llmApiKey.trim(), llmEndpoint: llmEndpoint.trim(), llmModel: llmModel.trim() });
    showToast('Prompt 助手 LLM 配置已保存！');
  };

  const handleSaveRuntimeUrl = () => {
    nativeSaveAgentRuntimeUrl(runtimeUrl.trim());
    onUpdateSettings({ runtimeUrl: runtimeUrl.trim() });
    showToast(runtimeUrl.trim() ? 'Agent Runtime 地址已保存' : '已恢复默认 Agent Runtime 地址');
  };

  return (
    <main id="settings-screen-main" className="max-w-4xl mx-auto px-4 lg:px-0 py-8 pt-24 pb-28 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-slate-100 tracking-tight">系统设置</h1>
        <p className="text-slate-400 text-sm">
          配置 AutoDL 连接令牌与 Prompt 助手 LLM 密钥，所有密钥均本地安全加密保存。
        </p>
      </div>

      {/* Toast Feedback Banner */}
      {toastMsg && (
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/40 rounded-xl text-indigo-200 flex items-center justify-between text-sm shadow-lg">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-400 text-base">check_circle</span>
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-slate-400 hover:text-white">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* AutoDL ComfyUI Connection */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4 shadow-lg">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px] text-indigo-400">key</span>
          AutoDL ComfyUI Token 设置
        </h2>
        <p className="text-slate-400 text-xs leading-relaxed">
          请输入你的 AutoDL.Art 分组 Token。此 Token 将在 Android 设备使用 Keystore 加密存储，不会打包写入源码或传至第三方。
        </p>

        <div className="flex flex-col gap-1.5">
          <label className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">ComfyUI Token</label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">
              vpn_key
            </span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 pl-10 pr-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder-slate-600"
              placeholder="输入 AutoDL ComfyUI 分组 Token..."
            />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleSaveAutoDLToken}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold text-xs text-white transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/20"
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            保存 Token
          </button>
        </div>
      </section>

      {/* LLM Agent Config */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4 shadow-lg">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px] text-indigo-400">smart_toy</span>
          Prompt 助手 Agent LLM 设置
        </h2>
        <p className="text-slate-400 text-xs leading-relaxed">
          用于在“Prompt 助手”Tab 中调用大语言模型进行 Skill 分镜构思。支持 MiniMax (`abab6.5s`)、DeepSeek 或兼容 OpenAI 格式的 API 接入。
        </p>

        <div className="flex flex-col gap-1.5">
          <label className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">LLM API Key</label>
          <input
            type="password"
            value={llmApiKey}
            onChange={(e) => setLlmApiKey(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-600"
            placeholder="如: sk-xxxxxxxxxxxxxxxxxxxxxxxx"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">LLM Model (模型名称)</label>
          <input
            type="text"
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-600"
            placeholder="默认: abab6.5s-chat (也可指定 deepseek-chat, gpt-4o-mini 等)"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">LLM API Endpoint (接口地址)</label>
          <input
            type="text"
            value={llmEndpoint}
            onChange={(e) => setLlmEndpoint(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-600"
            placeholder="默认: https://api.minimax.chat/v1/text/chatcompletion_v2"
          />
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleSaveLlmConfig}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold text-xs text-white transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/20"
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            保存 Agent 配置
          </button>
        </div>
      </section>

      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4 shadow-lg">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px] text-indigo-400">link</span>
          Agent Runtime 地址
        </h2>
        <p className="text-slate-400 text-xs leading-relaxed">
          APK 默认连接 Android Emulator 主机的 8787 端口（10.0.2.2）。真机请填写电脑在同一局域网中的 IP，例如 http://192.168.1.20:8787/api/copilotkit。
        </p>
        <input
          type="url"
          value={runtimeUrl}
          onChange={(e) => setRuntimeUrl(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-600"
          placeholder="留空使用默认地址；浏览器开发环境使用 /api/copilotkit"
        />
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleSaveRuntimeUrl}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold text-xs text-white transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/20"
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            保存 Runtime 地址
          </button>
        </div>
      </section>

      {/* Workflow Info */}
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-3 shadow-lg">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px] text-indigo-400">info</span>
          工作流说明
        </h2>
        <div className="text-xs text-slate-400 space-y-1.5 leading-relaxed font-mono">
          <p>• 工作流名称: MiniMax H3 图像与音频生视频 v2 (15s)</p>
          <p>• 工作流 ID: <span className="text-indigo-300">minimax_h3_image_audio_to_video_v2_15s</span></p>
          <p>• 参考素材限制: 最多 9 张图片、3 段音频，单次提交总文件上限 50 MB。</p>
          <p>• 下载存放目录: Android 公共电影目录 <span className="text-indigo-300">Movies/AutoDL-H3</span></p>
        </div>
      </section>
    </main>
  );
};
