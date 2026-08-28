import React, { useState, useEffect } from 'react';
import { MediaItem, VideoTask } from '../types';
import { nativePickMedia, nativeSubmitTask } from '../utils/nativeBridge';

interface CreateScreenProps {
  initialPrompt?: string;
  onGenerate: (taskData: Partial<VideoTask>) => void;
}

export const CreateScreen: React.FC<CreateScreenProps> = ({ initialPrompt = '', onGenerate }) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [resolution, setResolution] = useState('768p竖');
  const [duration, setDuration] = useState<number>(5);
  const [seed, setSeed] = useState<string>('');
  const [images, setImages] = useState<MediaItem[]>([]);
  const [audios, setAudios] = useState<MediaItem[]>([]);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);

  // Listen for media picked from Android native side
  useEffect(() => {
    window.onMediaPicked = (mediaJson: string) => {
      try {
        const item: MediaItem = JSON.parse(mediaJson);
        if (item.kind === 'image') {
          if (images.length < 9) setImages((prev) => [...prev, item]);
        } else if (item.kind === 'audio') {
          if (audios.length < 3) setAudios((prev) => [...prev, item]);
        }
      } catch (err) {
        console.error('Failed to parse picked media:', err);
      }
    };
    return () => {
      delete window.onMediaPicked;
    };
  }, [images.length, audios.length]);

  const handleAddMediaWeb = (kind: 'image' | 'audio', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      alert('单个素材不能超过 50MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      const newItem: MediaItem = {
        id: `${kind}-${Date.now()}-${Math.random()}`,
        kind,
        name: file.name,
        mime: file.type || (kind === 'image' ? 'image/png' : 'audio/mp3'),
        size: file.size,
        dataUri
      };
      if (kind === 'image') {
        if (images.length < 9) setImages((prev) => [...prev, newItem]);
        else alert('最多只能添加 9 张参考图');
      } else {
        if (audios.length < 3) setAudios((prev) => [...prev, newItem]);
        else alert('最多只能添加 3 段参考音频');
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePickMedia = (kind: 'image' | 'audio') => {
    if (kind === 'image' && images.length >= 9) {
      alert('最多只能添加 9 张参考图片');
      return;
    }
    if (kind === 'audio' && audios.length >= 3) {
      alert('最多只能添加 3 段参考音频');
      return;
    }

    // Call native Android picker if available, or trigger HTML file input
    if (typeof window !== 'undefined' && window.AndroidBridge?.pickMedia) {
      nativePickMedia(kind);
    } else {
      const input = document.getElementById(kind === 'image' ? 'web-img-input' : 'web-audio-input');
      input?.click();
    }
  };

  const handleRemoveImage = (id: string) => {
    setImages((prev) => prev.filter((item) => item.id !== id));
  };

  const handleRemoveAudio = (id: string) => {
    setAudios((prev) => prev.filter((item) => item.id !== id));
    if (playingAudioId === id) setPlayingAudioId(null);
  };

  const toggleAudioPlay = (item: MediaItem) => {
    if (playingAudioId === item.id) {
      setPlayingAudioId(null);
    } else {
      setPlayingAudioId(item.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) {
      alert('请输入 Prompt 描述');
      return;
    }

    const taskData: Partial<VideoTask> = {
      prompt: prompt.trim(),
      resolution,
      duration,
      seed: seed.trim() || undefined,
      images,
      audios,
      createdAt: Date.now()
    };

    nativeSubmitTask(taskData);
    onGenerate(taskData);
  };

  return (
    <main id="create-screen-main" className="pt-24 px-4 md:px-8 max-w-4xl mx-auto space-y-6 pb-28">
      {/* Title Header */}
      <div className="mb-2">
        <h1 className="text-3xl font-bold text-slate-100 tracking-tight mb-1">AutoDL H3 视频生成</h1>
        <p className="text-slate-400 text-sm">
          多图与多音频参考生视频 · minimax_h3_image_audio_to_video_v2_15s 工作流
        </p>
      </div>

      {/* Hidden Web Inputs */}
      <input
        id="web-img-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleAddMediaWeb('image', e)}
      />
      <input
        id="web-audio-input"
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => handleAddMediaWeb('audio', e)}
      />

      {/* Prompt Area */}
      <section className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Prompt (视频描述)
        </label>
        <div className="relative w-full rounded-2xl bg-slate-900 border border-slate-800 shadow-inner p-4 transition-all focus-within:border-indigo-500/80">
          <textarea
            id="video-prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full h-32 bg-transparent border-none text-slate-200 placeholder-slate-600 focus:outline-none resize-none font-body-base leading-relaxed"
            placeholder="描述你想生成的视频：主体、动作、场景、镜头运动、光影与音效..."
          />
          <div className="flex justify-between items-center pt-2 border-t border-slate-800/80">
            <span className="text-xs text-slate-500 font-mono">
              {prompt.length} 字符
            </span>
          </div>
        </div>
      </section>

      {/* Parameters */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Resolution Dropdown */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
            分辨率 (Resolution)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {['768p竖', '480p竖', '768p横', '480p横'].map((res) => (
              <button
                key={res}
                type="button"
                onClick={() => setResolution(res)}
                className={`px-3 py-2.5 text-xs font-medium rounded-lg transition-all ${
                  resolution === res
                    ? 'border border-indigo-500 bg-indigo-500/10 text-indigo-300 shadow-sm font-bold'
                    : 'border border-slate-800 bg-slate-800/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                {res}
              </button>
            ))}
          </div>
        </div>

        {/* Duration & Seed */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                视频时长 (Duration)
              </label>
              <span className="font-mono text-indigo-400 text-xs font-semibold">{duration} 秒</span>
            </div>
            <input
              id="duration-slider"
              type="range"
              min="1"
              max="15"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-slate-500 font-mono text-[10px]">
              <span>1 秒</span>
              <span>15 秒</span>
            </div>
          </div>

          <div className="pt-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              随机种子 Seed (可选)
            </label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="如 123456 (留空则随机)"
              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/80 font-mono"
            />
          </div>
        </div>
      </section>

      {/* Media Reference Section */}
      <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">参考素材</h3>
            <p className="text-xs text-slate-400">支持最多 9 张图片及 3 段音频 (总限制 50MB)</p>
          </div>
          <span className="text-xs font-mono text-indigo-400">
            图 {images.length}/9 · 音 {audios.length}/3
          </span>
        </div>

        {/* Action Add Buttons */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handlePickMedia('image')}
            disabled={images.length >= 9}
            className="flex-1 py-2.5 px-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">add_photo_alternate</span>
            ＋ 添加参考图片
          </button>
          <button
            type="button"
            onClick={() => handlePickMedia('audio')}
            disabled={audios.length >= 3}
            className="flex-1 py-2.5 px-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">library_music</span>
            ＋ 添加参考音频
          </button>
        </div>

        {/* Image Grid Previews */}
        {images.length > 0 && (
          <div className="space-y-2 pt-2">
            <label className="text-xs font-mono text-slate-400">参考图片列表 (@image0 - @image{images.length - 1}):</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {images.map((img, idx) => (
                <div key={img.id} className="relative group rounded-xl overflow-hidden border border-slate-800 bg-slate-950 aspect-square">
                  <img src={img.dataUri} alt={`ref_image_${idx}`} className="w-full h-full object-cover" />
                  <span className="absolute top-1 left-1 bg-slate-900/80 text-indigo-300 font-mono text-[10px] px-1.5 py-0.5 rounded">
                    @{idx}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveImage(img.id)}
                    className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-600 text-white p-1 rounded-full opacity-90 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-xs">close</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audio Previews */}
        {audios.length > 0 && (
          <div className="space-y-2 pt-2">
            <label className="text-xs font-mono text-slate-400">参考音频列表 (@audio0 - @audio{audios.length - 1}):</label>
            <div className="space-y-2">
              {audios.map((aud, idx) => (
                <div key={aud.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-slate-950">
                  <div className="flex items-center gap-3">
                    <span className="bg-slate-800 text-indigo-300 font-mono text-xs px-2 py-1 rounded font-bold">
                      @audio{idx}
                    </span>
                    <div>
                      <p className="text-xs text-slate-200 font-medium truncate max-w-[180px]">{aud.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{(aud.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <audio
                      src={aud.dataUri}
                      controls
                      className="h-8 max-w-[140px] sm:max-w-[200px]"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveAudio(aud.id)}
                      className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Generate Button Action */}
      <div className="pt-2 w-full flex flex-col items-center gap-3">
        <button
          id="btn-generate-video"
          type="button"
          onClick={handleSubmit}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-xl shadow-indigo-600/20 hover:shadow-indigo-500/30 transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.99]"
        >
          <span>提交 AutoDL 任务生成</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>
        <p className="text-xs text-slate-500 text-center font-mono">
          提交后将保存至“任务队列”，并在成功后自动下载 MP4 至本地 Movies/AutoDL-H3
        </p>
      </div>
    </main>
  );
};
