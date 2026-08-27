import React, { useState } from 'react';
import { samplePrompts } from '../mockData';
import { VideoTask } from '../types';

interface CreateScreenProps {
  onGenerate: (taskData: Partial<VideoTask>) => void;
}

export const CreateScreen: React.FC<CreateScreenProps> = ({ onGenerate }) => {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('MiniMax H3');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('9:16');
  const [duration, setDuration] = useState<number>(5);
  const [cfgScale, setCfgScale] = useState<number>(7.0);
  const [motionControl, setMotionControl] = useState<number>(80);
  const [isListening, setIsListening] = useState(false);

  const handleRandomPrompt = () => {
    const random = samplePrompts[Math.floor(Math.random() * samplePrompts.length)];
    setPrompt(random);
  };

  const handleSpeech = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setPrompt((prev) => (prev ? prev + ' futuristic neon cyberpunk scene' : 'Futuristic cyberpunk skyline in neon rain'));
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setPrompt((prev) => (prev ? `${prev} ${text}` : text));
      };
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleTagClick = (tag: string) => {
    setPrompt((prev) => {
      if (!prev) return tag;
      if (prev.includes(tag)) return prev;
      return `${prev}, ${tag}`;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalPrompt = prompt.trim() || 'Cinematic drone shot over a glowing cyberpunk city';
    const titleWords = finalPrompt.split(' ').slice(0, 4).join(' ');
    const title = titleWords.length > 25 ? titleWords.slice(0, 25) + '...' : titleWords || 'Generated Scene';

    onGenerate({
      title,
      prompt: finalPrompt,
      aspectRatio,
      duration,
      model
    });
  };

  const computeUnits = (duration * 0.24).toFixed(1);

  return (
    <main id="create-screen-main" className="pt-24 px-4 md:px-8 max-w-4xl mx-auto space-y-6 pb-28">
      {/* Title Header */}
      <div className="mb-2">
        <h1 className="text-3xl font-bold text-slate-100 tracking-tight mb-1">Creative Studio</h1>
        <p className="text-slate-400 text-sm">
          Describe your vision and let the AI generate high-fidelity video sequences.
        </p>
      </div>

      {/* Prompt Area */}
      <section className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Video Prompt
        </label>
        <div className="relative w-full rounded-2xl bg-slate-900 border border-slate-800 shadow-inner p-4 transition-all focus-within:border-indigo-500/80">
          <textarea
            id="video-prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full h-32 bg-transparent border-none text-slate-200 placeholder-slate-600 focus:outline-none resize-none font-body-base leading-relaxed"
            placeholder="Describe the video you want to generate in detail... (e.g. 'A neon-lit futuristic city street at night during a heavy rainfall, cybernetic reflections...')"
          />
          <div className="flex justify-between items-center pt-2 border-t border-slate-800/80">
            <span className="text-xs text-slate-500 font-mono">
              {prompt.length} characters
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                id="btn-random-prompt"
                onClick={handleRandomPrompt}
                title="Generate Random Prompt"
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-sm">casino</span>
              </button>
              <button
                type="button"
                id="btn-mic-prompt"
                onClick={handleSpeech}
                title="Voice Input"
                className={`p-2 rounded-lg transition-colors ${
                  isListening
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-sm">mic</span>
              </button>
            </div>
          </div>
        </div>

        {/* Inspiration Tags */}
        <div className="flex overflow-x-auto hide-scrollbar gap-2 py-1">
          {['Cinematic drone shot', 'Cyberpunk city rain', 'Macro nature time-lapse', 'Anime style neon'].map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => handleTagClick(tag)}
              className="whitespace-nowrap px-3.5 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:border-indigo-500/50 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors text-xs font-medium bg-slate-900/60 cursor-pointer active:scale-95"
            >
              {tag}
            </button>
          ))}
        </div>
      </section>

      {/* Parameters Bento Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Model Engine */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Model Engine
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setModel('MiniMax H3')}
              className={`px-3 py-2.5 text-xs font-medium rounded-lg transition-all ${
                model.includes('H3')
                  ? 'border border-indigo-500/50 bg-indigo-500/10 text-indigo-300 shadow-sm'
                  : 'border border-slate-800 bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              MiniMax H3 (Cinematic)
            </button>
            <button
              type="button"
              onClick={() => setModel('MiniMax H2 (Legacy)')}
              className={`px-3 py-2.5 text-xs font-medium rounded-lg transition-all ${
                model.includes('H2')
                  ? 'border border-indigo-500/50 bg-indigo-500/10 text-indigo-300 shadow-sm'
                  : 'border border-slate-800 bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              MiniMax H2 (Legacy)
            </button>
          </div>
          <p className="text-[11px] text-slate-500 font-mono">
            Selected: {model} • 1080p Neural Rendering
          </p>
        </div>

        {/* Aspect Ratio & Duration */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Aspect Ratio
            </label>
            <div className="flex space-x-2">
              <button
                type="button"
                id="aspect-16-9"
                onClick={() => setAspectRatio('16:9')}
                className={`flex-1 py-2.5 rounded-lg border flex flex-col items-center justify-center space-y-1 transition-all ${
                  aspectRatio === '16:9'
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                    : 'border-slate-800 bg-slate-800/50 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="w-5 h-3 border border-current rounded-sm"></div>
                <span className="text-[10px] font-mono">16:9</span>
              </button>

              <button
                type="button"
                id="aspect-9-16"
                onClick={() => setAspectRatio('9:16')}
                className={`flex-1 py-2.5 rounded-lg border flex flex-col items-center justify-center space-y-1 transition-all ${
                  aspectRatio === '9:16'
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                    : 'border-slate-800 bg-slate-800/50 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="w-3 h-5 border border-current rounded-sm"></div>
                <span className="text-[10px] font-mono">9:16</span>
              </button>

              <button
                type="button"
                id="aspect-1-1"
                onClick={() => setAspectRatio('1:1')}
                className={`flex-1 py-2.5 rounded-lg border flex flex-col items-center justify-center space-y-1 transition-all ${
                  aspectRatio === '1:1'
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                    : 'border-slate-800 bg-slate-800/50 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="w-4 h-4 border border-current rounded-sm"></div>
                <span className="text-[10px] font-mono">1:1</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Duration
              </label>
              <span className="font-mono text-indigo-400 text-xs font-semibold">{duration}.0 SEC</span>
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
              <span>1.0s</span>
              <span>Est. Compute: ~{computeUnits} units</span>
              <span>15.0s</span>
            </div>
          </div>
        </div>

        {/* Advanced Settings Toggle */}
        <div className="md:col-span-2">
          <details className="group bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <summary className="flex items-center gap-2 cursor-pointer text-slate-400 hover:text-slate-200 transition-colors text-xs font-semibold uppercase tracking-wider select-none">
              <span className="material-symbols-outlined group-open:rotate-90 transition-transform text-sm text-indigo-400">
                chevron_right
              </span>
              Advanced Parameters
            </summary>
            <div className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-mono text-slate-400">CFG Scale</label>
                  <span className="text-indigo-400 font-mono text-xs">{cfgScale.toFixed(1)}</span>
                </div>
                <input
                  id="cfg-slider"
                  type="range"
                  min="1"
                  max="20"
                  step="0.5"
                  value={cfgScale}
                  onChange={(e) => setCfgScale(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-mono text-slate-400">Motion Control</label>
                  <span className="text-indigo-400 font-mono text-xs">
                    {motionControl > 70 ? 'High' : motionControl > 40 ? 'Medium' : 'Low'} ({motionControl})
                  </span>
                </div>
                <input
                  id="motion-slider"
                  type="range"
                  min="1"
                  max="100"
                  value={motionControl}
                  onChange={(e) => setMotionControl(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
              </div>
            </div>
          </details>
        </div>
      </section>

      {/* Generate Button Action */}
      <div className="pt-2 w-full flex flex-col items-center gap-3">
        <div className="w-full flex justify-between items-center px-1 text-xs text-slate-400">
          <span>Available Credits</span>
          <span className="text-indigo-400 font-bold font-mono">842 / 1000</span>
        </div>
        <button
          id="btn-generate-video"
          type="button"
          onClick={handleSubmit}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-xl shadow-indigo-600/20 hover:shadow-indigo-500/30 transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.99]"
        >
          <span>Generate Video</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>
        <p className="text-xs text-slate-500 text-center font-mono">
          Estimated generation time: ~45s • MiniMax H3 Active
        </p>
      </div>
    </main>
  );
};

