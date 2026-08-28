import type { GalleryItem, VideoTask } from "../types";

export type TaskBucket = "active" | "history";

export type DownloadPresentation = {
  state: "unknown" | "downloading" | "ready" | "failed";
  label: string;
};

export function resolveTaskMediaSource(
  task: Pick<VideoTask, "localUri" | "videoUrl">,
): string {
  return task.localUri?.trim() || task.videoUrl?.trim() || "";
}

export function classifyTask(task: Pick<VideoTask, "status">): TaskBucket {
  return task.status === "QUEUED" || task.status === "RUNNING" ? "active" : "history";
}

export function getTaskDownloadPresentation(
  task: Pick<VideoTask, "localUri" | "downloadState">,
): DownloadPresentation {
  if (task.localUri?.trim() || task.downloadState === "已下载") {
    return { state: "ready", label: "本地视频就绪" };
  }
  if (task.downloadState === "下载中") {
    return { state: "downloading", label: "下载中" };
  }
  if (task.downloadState?.startsWith("下载失败")) {
    return { state: "failed", label: task.downloadState };
  }
  return { state: "unknown", label: "" };
}

export function toGalleryItem(task: VideoTask): GalleryItem {
  const mediaSource = resolveTaskMediaSource(task);
  return {
    id: task.id,
    title: task.title || `任务 ${task.id}`,
    prompt: task.prompt,
    duration: `${task.duration}s`,
    thumbnailUrl: mediaSource,
    videoUrl: task.videoUrl || "",
    localUri: task.localUri,
    downloadId: task.downloadId,
    downloadState: task.downloadState,
    resolution: task.resolution,
    timestamp: new Date(task.createdAt || Date.now()).toLocaleDateString(),
    createdAt: task.createdAt,
    status: task.status,
  };
}
