import React, { useEffect, useMemo, useState } from "react";
import Lightbox from "yet-another-react-lightbox";
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import Video from "yet-another-react-lightbox/plugins/video";
import type { GalleryItem, VideoTask } from "../types";
import { resolveMediaSrc } from "../utils/nativeBridge";

interface MediaLightboxProps {
  item: GalleryItem | VideoTask | null;
  onClose: () => void;
  onReusePrompt?: (prompt: string) => void;
}

export const MediaLightbox: React.FC<MediaLightboxProps> = ({ item, onClose, onReusePrompt }) => {
  const [copiedType, setCopiedType] = useState<"id" | "prompt" | null>(null);
  const [loadError, setLoadError] = useState(false);

  const mediaSrc = resolveMediaSrc(item || undefined);
  const slides = useMemo(
    () => (mediaSrc ? [{
      type: "video" as const,
      sources: [{ src: mediaSrc, type: "video/mp4" }],
      autoPlay: true,
      controls: true,
      muted: false,
      playsInline: true,
      preload: "auto",
    }] : []),
    [mediaSrc],
  );

  useEffect(() => {
    setLoadError(false);
    setCopiedType(null);
  }, [item?.id]);

  useEffect(() => {
    const handleNativeBack = () => {
      if (item) onClose();
    };
    const windowState = window as Window & { __autodlMediaLightboxOpen?: boolean };
    windowState.__autodlMediaLightboxOpen = Boolean(item);
    window.addEventListener("nativeBackPressed", handleNativeBack);
    return () => {
      window.removeEventListener("nativeBackPressed", handleNativeBack);
      windowState.__autodlMediaLightboxOpen = false;
    };
  }, [item, onClose]);

  if (!item) return null;

  const id = item.id;
  const title = item.title || `任务 ${id}`;
  const prompt = item.prompt || "";
  const resolution = item.resolution || "768p";
  const duration = typeof item.duration === "number" ? `${item.duration}s` : item.duration;
  const downloadState = item.downloadState || "";

  const copyText = async (value: string, type: "id" | "prompt") => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedType(type);
      window.setTimeout(() => setCopiedType(null), 2000);
    } catch {
      setCopiedType(null);
    }
  };

  return (
    <Lightbox
      open={Boolean(item && slides.length)}
      close={onClose}
      slides={slides}
      index={0}
      plugins={[Video, Fullscreen]}
      controller={{ closeOnBackdropClick: true, closeOnEscape: true }}
      toolbar={{ buttons: ["close"] }}
      labels={{ Close: "关闭预览", Lightbox: "视频预览" }}
      className="autodl-media-lightbox"
      render={{
        slide: ({ slide }) => {
          if (slide.type !== "video") return null;
          return (
            <div className="grid h-full min-h-0 w-full grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
              <div className="relative flex min-h-0 aspect-video items-center justify-center bg-black md:aspect-auto">
                {loadError ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-300">
                    <span className="material-symbols-outlined text-5xl text-amber-400">error_outline</span>
                    <p className="text-sm font-semibold">视频加载失败或格式不受支持</p>
                    <p className="text-xs text-slate-500">可以尝试重新下载或使用远程地址打开。</p>
                  </div>
                ) : (
                  <video
                    src={mediaSrc}
                    autoPlay
                    controls
                    playsInline
                    preload="auto"
                    className="h-full w-full object-contain"
                    onError={() => setLoadError(true)}
                  />
                )}
              </div>

              <aside className="min-h-0 max-h-[42dvh] overflow-y-auto border-t border-slate-800 bg-slate-950 p-4 text-slate-100 md:max-h-none md:border-l md:border-t-0 md:p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{title}</h2>
                    <p className="mt-1 font-mono text-[10px] text-slate-500">
                      {resolution} · {duration}{downloadState ? ` · ${downloadState}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="关闭视频详情"
                    title="关闭视频详情"
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Generation Prompt</span>
                    <button
                      type="button"
                      onClick={() => copyText(prompt, "prompt")}
                      disabled={!prompt}
                      className="flex items-center gap-1 text-[11px] text-indigo-300 disabled:text-slate-600"
                    >
                      <span className="material-symbols-outlined text-[13px]">content_copy</span>
                      {copiedType === "prompt" ? "Prompt 已复制" : "复制 Prompt"}
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap break-words rounded-lg border border-slate-800 bg-slate-900/80 p-3 font-mono text-xs leading-relaxed text-slate-300">
                    {prompt || "无 Prompt 描述"}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-900 pt-3">
                  <button
                    type="button"
                    onClick={() => copyText(id, "id")}
                    className="flex items-center gap-1 font-mono text-[11px] text-slate-400 hover:text-slate-200"
                  >
                    <span className="material-symbols-outlined text-[13px]">tag</span>
                    {copiedType === "id" ? "ID 已复制" : `ID: ${id}`}
                  </button>
                  {onReusePrompt && prompt && (
                    <button
                      type="button"
                      onClick={() => {
                        onReusePrompt(prompt);
                        onClose();
                      }}
                      className="flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20"
                    >
                      <span className="material-symbols-outlined text-sm">edit_note</span>
                      在生成页重用此 Prompt
                    </button>
                  )}
                </div>
              </aside>
            </div>
          );
        },
      }}
    />
  );
};
