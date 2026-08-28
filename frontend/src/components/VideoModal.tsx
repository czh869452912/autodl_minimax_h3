import React, { useState, useRef } from 'react';
import { GalleryItem, VideoTask } from '../types';
import { resolveMediaSrc, nativeRetryDownload } from '../utils/nativeBridge';

interface VideoModalProps {
  item: GalleryItem | VideoTask | null;
  onClose: () => void;
  onReusePrompt?: (prompt: string) => void;
}

export const VideoModal: React.FC<VideoModalProps> = ({ item, onClose, onReusePrompt }) => {
  const [copiedType, setCopiedType] = useState<'id' | 'prompt' | null>(null);
  const [loadError, setLoadError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!item) return null;

  const id = item.id;
  const title = item.title || `任务 ${id}`;
  const prompt = item.prompt || '';
  const resolution = item.resolution || '768p';
  const duration = typeof item.duration === 'number' ? `${item.duration}s` : item.duration;
  const downloadState = item.downloadState || '';
  const videoSrc = resolveMediaSrc(item);

  const handleCopyId = () => {
    navigator.clipboard.writeText(id);
    setCopiedType('id');
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleCopyPrompt = () => {
    if (!prompt) return;
    navigator.clipboard.writeText(prompt);
    setCopiedType('prompt');
    setTimeout(() => setCopiedType(null), 2000);
  };

  const handleOpenExternal = () => {
    if (item.videoUrl) {
      window.open(item.videoUrl, '_blank');
    }
  };

  const handleRetryDownload = () => {
    nativeRetryDownload(id);
  };

  return (
    <div
      id="video-player-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-emerald-400 text-lg">check_circle</span>
            <div className="flex flex-col">
              <h3 className="text-sm font-semibold text-slate-100 truncate max-w-md">
                {title}
              </h3>
              <span className="text-[10px] font-mono text-slate-400">
                {resolution} • {duration} {downloadState ? `• ${downloadState}` : ''}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Video Canvas Player */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {videoSrc && !loadError ? (
            <video
              ref={videoRef}
              src={videoSrc}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain bg-black"
              onError={() => setLoadError(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 p-6 text-center space-y-3">
              <span className="material-symbols-outlined text-5xl text-amber-400">
                {loadError ? 'error_outline' : 'videocam_off'}
              </span>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-200">
                  {loadError ? '视频加载失败或格式不受支持' : '暂无可用视频播放源'}
                </p>
                <p className="text-xs text-slate-500 font-mono">
                  {item.videoUrl ? '你可以尝试点击外链在浏览器中打开或重新下载' : '任务尚未生成有效视频 URL'}
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                {item.videoUrl && (
                  <button
                    type="button"
                    onClick={handleOpenExternal}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <span className="material-symbols-outlined text-sm">open_in_new</span>
                    在新窗口打开
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRetryDownload}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer transition-all"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  重新下载
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Prompt & Details Footer */}
        <div className="p-6 bg-slate-950 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">
                Generation Prompt (生成提示词)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-mono flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[13px]">content_copy</span>
                  {copiedType === 'prompt' ? 'Prompt 已复制!' : '复制 Prompt'}
                </button>
                <span className="text-slate-700">|</span>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="text-[11px] text-slate-400 hover:text-slate-200 font-mono flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-[13px]">tag</span>
                  {copiedType === 'id' ? 'ID 已复制!' : `ID: ${id}`}
                </button>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/80 p-3 rounded-lg border border-slate-800 font-mono select-text">
              {prompt || '无 Prompt 描述'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-900">
            <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px]">
              <span>MiniMax H3 Workflow</span>
              <span>•</span>
              <span>{resolution}</span>
              {downloadState && (
                <>
                  <span>•</span>
                  <span className={downloadState === '已下载' ? 'text-emerald-400' : 'text-indigo-400'}>
                    {downloadState}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {onReusePrompt && prompt && (
                <button
                  type="button"
                  onClick={() => {
                    onReusePrompt(prompt);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">edit_note</span>
                  在生成页重用此 Prompt
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-slate-800 text-white font-semibold text-xs hover:bg-slate-700 transition-colors cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


