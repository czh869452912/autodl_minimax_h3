import React, { useState } from 'react';
import { GalleryItem, VideoTask } from '../types';

interface VideoModalProps {
  item: GalleryItem | VideoTask | null;
  onClose: () => void;
}

export const VideoModal: React.FC<VideoModalProps> = ({ item, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [copied, setCopied] = useState(false);

  if (!item) return null;

  const title = item.title;
  const prompt = item.prompt;
  const id = item.id;
  const thumbnailUrl = item.thumbnailUrl;

  const handleCopyId = () => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      id="video-player-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-emerald-400 text-lg">check_circle</span>
            <h3 className="text-sm font-semibold text-slate-100 truncate max-w-md">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Video Canvas Simulation */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden group">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={title}
              className={`w-full h-full object-cover transition-transform duration-700 ${
                isPlaying ? 'scale-105 filter brightness-105' : ''
              }`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-900">
              <span className="material-symbols-outlined text-5xl text-slate-600">smart_display</span>
            </div>
          )}

          {/* Playing overlay simulation */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent flex flex-col justify-end p-6">
            <div className="flex items-center justify-between text-white">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-10 h-10 rounded-full bg-indigo-600/80 hover:bg-indigo-500 text-white backdrop-blur-md flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-indigo-600/30"
                >
                  <span
                    className="material-symbols-outlined text-xl"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {isPlaying ? 'pause' : 'play_arrow'}
                  </span>
                </button>
                <div className="text-xs font-mono text-slate-300">
                  00:{isPlaying ? '08' : '00'} / 00:15
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyId}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300 flex items-center gap-1.5 transition-colors border border-slate-700"
                >
                  <span className="material-symbols-outlined text-sm">content_copy</span>
                  {copied ? 'Copied!' : `ID: ${id}`}
                </button>
              </div>
            </div>

            {/* Video progress bar */}
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-indigo-500 h-full transition-all duration-300 rounded-full"
                style={{ width: isPlaying ? '55%' : '0%' }}
              />
            </div>
          </div>
        </div>

        {/* Prompt & Details Footer */}
        <div className="p-6 bg-slate-950 space-y-4">
          <div className="space-y-1.5">
            <span className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">Generation Prompt</span>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900 p-3 rounded-lg border border-slate-800">
              {prompt || 'High quality cinematic AI render generated with MiniMax H3 Neural Engine.'}
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="font-mono text-xs text-slate-500">Neural Engine MiniMax H3 • 1080p</span>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold text-xs hover:bg-indigo-500 transition-colors shadow-md shadow-indigo-600/20"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

