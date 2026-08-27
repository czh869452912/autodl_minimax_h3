import React from 'react';
import { VideoTask } from '../types';
import { nativeRetryDownload } from '../utils/nativeBridge';

interface TasksScreenProps {
  tasks: VideoTask[];
  onCancelTask: (taskId: string) => void;
  onRestartTask: (taskId: string) => void;
  onClearHistory: () => void;
  onSelectTask: (task: VideoTask) => void;
}

export const TasksScreen: React.FC<TasksScreenProps> = ({
  tasks,
  onCancelTask,
  onClearHistory,
  onSelectTask,
}) => {
  const activeTasks = tasks.filter((t) => t.status === 'QUEUED' || t.status === 'RUNNING');
  const pastTasks = tasks.filter((t) => t.status === 'SUCCESS' || t.status === 'FAILED' || t.status === 'CANCELLED');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'QUEUED':
        return (
          <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-md text-xs font-semibold">
            排队中 QUEUED
          </span>
        );
      case 'RUNNING':
        return (
          <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1">
            <span className="material-symbols-outlined text-xs animate-spin">sync</span>执行中 RUNNING
          </span>
        );
      case 'SUCCESS':
        return (
          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-md text-xs font-semibold flex items-center gap-1">
            <span className="material-symbols-outlined text-xs">check_circle</span>已完成 SUCCESS
          </span>
        );
      case 'FAILED':
        return (
          <span className="bg-red-500/10 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-md text-xs font-semibold">
            失败 FAILED
          </span>
        );
      default:
        return <span className="bg-slate-800 text-slate-400 px-2.5 py-1 rounded-md text-xs">{status}</span>;
    }
  };

  return (
    <main id="tasks-screen-main" className="pt-24 px-4 md:px-8 max-w-5xl mx-auto w-full space-y-8 pb-28">
      {/* Active Tasks */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-100 tracking-tight">任务队列</h2>
            <p className="text-xs text-slate-400 mt-0.5">显示本机提交的 AutoDL ComfyUI 异步生成任务</p>
          </div>
          <span className="bg-indigo-500/10 text-indigo-400 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-2 border border-indigo-500/30">
            <span className="w-2 h-2 rounded-full bg-indigo-400 pulse-dot" />
            {activeTasks.length} 进行中
          </span>
        </div>

        {activeTasks.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
            <span className="material-symbols-outlined text-4xl mb-2 text-slate-500">task_alt</span>
            <p className="font-semibold text-slate-200 text-sm">暂无生成中的任务</p>
            <p className="text-xs text-slate-500 mt-1">先去“生成”页提交一个任务吧。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeTasks.map((task) => (
              <div
                key={task.id}
                className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4 relative overflow-hidden shadow-lg"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-mono text-xs text-indigo-400 mb-1">ID: {task.id}</div>
                    <p className="font-medium text-slate-200 text-sm line-clamp-2">{task.prompt}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCancelTask(task.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors p-1 cursor-pointer"
                    title="移除任务"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <div className="text-xs text-slate-400 font-mono">
                    {task.resolution} · {task.duration}s
                  </div>
                  {getStatusBadge(task.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Past Tasks */}
      <section className="space-y-4 pt-2">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-xl font-bold text-slate-100 tracking-tight">历史记录</h2>
          <button
            type="button"
            onClick={onClearHistory}
            className="text-indigo-400 hover:text-indigo-300 font-medium text-xs transition-colors cursor-pointer"
          >
            清空已完成记录
          </button>
        </div>

        {pastTasks.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-sm">
            暂无历史任务。
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pastTasks.map((task) => {
              const isSuccess = task.status === 'SUCCESS';
              return (
                <div
                  key={task.id}
                  onClick={() => isSuccess && onSelectTask(task)}
                  className={`bg-slate-900/40 border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                    isSuccess
                      ? 'border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900/80 cursor-pointer'
                      : 'border-red-900/30 bg-red-950/10'
                  }`}
                >
                  <div className="flex flex-col min-w-0 pr-4">
                    <span className="font-semibold text-slate-200 text-sm truncate">{task.prompt}</span>
                    <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-slate-500 mt-1">
                      <span>ID: {task.id}</span>
                      <span>•</span>
                      <span>{task.resolution}</span>
                      <span>•</span>
                      <span>{task.duration}s</span>
                      {task.downloadState === '已下载' && (
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded text-[10px]">
                          本地视频就绪
                        </span>
                      )}
                      {task.downloadState === '下载中' && (
                        <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.2 rounded text-[10px] flex items-center gap-1">
                          <span className="material-symbols-outlined text-[10px] animate-spin">sync</span>
                          下载中
                        </span>
                      )}
                      {task.downloadState && task.downloadState.startsWith('下载失败') && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            nativeRetryDownload(task.id);
                          }}
                          className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] flex items-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[12px]">refresh</span>
                          重试下载
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    {getStatusBadge(task.status)}
                    {isSuccess && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTask(task);
                        }}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
                      >
                        <span className="material-symbols-outlined text-sm">play_arrow</span>
                        播放
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCancelTask(task.id);
                      }}
                      className="p-1 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                      title="移除记录"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
};

