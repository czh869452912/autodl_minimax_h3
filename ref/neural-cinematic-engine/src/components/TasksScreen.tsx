import React from 'react';
import { VideoTask } from '../types';

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
  onRestartTask,
  onClearHistory,
  onSelectTask,
}) => {
  const activeTasks = tasks.filter((t) => t.status === 'rendering' || t.status === 'queuing');
  const pastTasks = tasks.filter((t) => t.status === 'done' || t.status === 'failed');

  return (
    <main id="tasks-screen-main" className="pt-24 px-4 md:px-8 max-w-5xl mx-auto w-full space-y-8 pb-28 md:pl-28">
      {/* Active Tasks Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-100 tracking-tight">Active Generation</h2>
            <p className="text-xs text-slate-400 mt-0.5">Real-time background rendering queue</p>
          </div>
          <span className="bg-indigo-500/10 text-indigo-400 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-2 border border-indigo-500/30">
            <span className="w-2 h-2 rounded-full bg-indigo-400 pulse-dot" />
            {activeTasks.length} Running
          </span>
        </div>

        {activeTasks.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center text-slate-400">
            <span className="material-symbols-outlined text-4xl mb-2 text-slate-500">check_circle</span>
            <p className="font-semibold text-slate-200 text-sm">All generation tasks completed.</p>
            <p className="text-xs text-slate-500 mt-1">Create a new video from the Create tab.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeTasks.map((task) => (
              <div
                key={task.id}
                id={`task-card-${task.id}`}
                className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4 relative overflow-hidden group shadow-lg"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-mono text-xs text-slate-500 mb-1">ID: {task.id}</div>
                    <h3 className="font-semibold text-slate-100 text-sm">{task.title}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCancelTask(task.id)}
                    className="text-slate-400 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer"
                    title="Cancel Task"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>
                </div>

                {task.status === 'rendering' ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-indigo-400 text-sm animate-spin">sync</span>
                      <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                        Rendering - {task.progress || 64}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 progress-bar-animated rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-300"
                        style={{ width: `${task.progress || 64}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs font-mono text-slate-400 mt-1.5">
                      <span>{task.eta || 'ETA: 45s'}</span>
                      <span>{task.step || 'Step 32/50'}</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-slate-400 text-sm">schedule</span>
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Queuing</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-700 w-full rounded-full" />
                    </div>
                    <div className="flex justify-between text-xs font-mono text-slate-400 mt-1.5">
                      <span>Position in queue: #{task.queuePosition || 3}</span>
                      <span>--</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Past Tasks Section */}
      <section className="space-y-4 pt-2">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-xl font-bold text-slate-100 tracking-tight">Past Tasks</h2>
          <button
            type="button"
            onClick={onClearHistory}
            className="text-indigo-400 hover:text-indigo-300 font-medium text-xs transition-colors cursor-pointer"
          >
            Clear History
          </button>
        </div>

        {pastTasks.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-6 text-center text-slate-500 text-sm">
            No previous task history.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pastTasks.map((task) => (
              <div
                key={task.id}
                id={`past-task-${task.id}`}
                onClick={() => task.status === 'done' && onSelectTask(task)}
                className={`bg-slate-900/40 border rounded-xl p-3.5 flex items-center justify-between transition-all ${
                  task.status === 'done'
                    ? 'border-slate-800 hover:border-slate-700 hover:bg-slate-900/80 cursor-pointer'
                    : 'border-red-900/40 bg-red-950/10'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {task.status === 'done' ? (
                    <div className="w-11 h-11 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden shrink-0 border border-slate-700">
                      {task.thumbnailUrl ? (
                        <img
                          src={task.thumbnailUrl}
                          alt={task.title}
                          className="w-full h-full object-cover opacity-85 hover:opacity-100"
                        />
                      ) : (
                        <span className="material-symbols-outlined text-emerald-400 text-xl">smart_display</span>
                      )}
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-red-400">error</span>
                    </div>
                  )}

                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-slate-200 text-sm truncate">{task.title}</span>
                    <span className="font-mono text-xs text-slate-500">
                      ID: {task.id} • {task.timeAgo}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {task.status === 'done' ? (
                    <>
                      <span className="bg-emerald-500/10 text-emerald-400 font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 border border-emerald-500/30 text-[11px]">
                        <span className="material-symbols-outlined text-[14px]">check_circle</span> Done
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectTask(task);
                        }}
                        className="material-symbols-outlined text-slate-400 hover:text-slate-200 transition-colors p-1"
                      >
                        more_vert
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-red-400 text-xs hidden md:block">
                        {task.errorReason || 'VRAM exhaustion error'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRestartTask(task.id);
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer active:scale-95"
                      >
                        <span className="material-symbols-outlined text-[16px]">refresh</span> Restart
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
};

