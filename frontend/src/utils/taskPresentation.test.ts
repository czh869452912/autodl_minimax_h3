import { describe, expect, it } from "vitest";
import type { VideoTask } from "../types";
import {
  classifyTask,
  getTaskDownloadPresentation,
  resolveTaskMediaSource,
} from "./taskPresentation";

function makeTask(overrides: Partial<VideoTask> = {}): VideoTask {
  return {
    id: "task-1",
    prompt: "A cinematic test video",
    status: "QUEUED",
    resolution: "768p竖",
    duration: 5,
    createdAt: 1,
    ...overrides,
  };
}

describe("task presentation", () => {
  it("uses a completed local download as the media source", () => {
    const task = makeTask({
      status: "SUCCESS",
      videoUrl: "https://example.test/video.mp4",
      localUri: "file:///storage/emulated/0/Movies/AutoDL-H3/task.mp4",
      downloadState: "下载中",
    });

    expect(resolveTaskMediaSource(task)).toBe(task.localUri);
    expect(getTaskDownloadPresentation(task)).toMatchObject({
      state: "ready",
      label: "本地视频就绪",
    });
  });

  it("classifies successful tasks as history even while download is running", () => {
    expect(classifyTask(makeTask({ status: "SUCCESS", downloadState: "下载中" }))).toBe("history");
  });

  it("keeps queued and running tasks active", () => {
    expect(classifyTask(makeTask({ status: "RUNNING", downloadState: "" }))).toBe("active");
  });
});
