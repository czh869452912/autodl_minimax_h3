import React, { Component, ErrorInfo, ReactNode, useState, useEffect, useCallback } from 'react';
import { ScreenType, VideoTask, GalleryItem, AppSettings } from './types';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { CreateScreen } from './components/CreateScreen';
import { AgentScreen } from './components/AgentScreen';
import { TasksScreen } from './components/TasksScreen';
import { GalleryScreen } from './components/GalleryScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { VideoModal } from './components/VideoModal';
import { nativeLoadTasks, nativeSaveTasks, nativeReadToken } from './utils/nativeBridge';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="pt-24 px-4 max-w-4xl mx-auto">
          <div className="p-6 bg-slate-900 border border-red-500/30 rounded-2xl text-slate-200 space-y-3 shadow-xl">
            <h2 className="text-lg font-bold text-red-400 flex items-center gap-2">
              <span className="material-symbols-outlined">error</span>
              页面渲染发生未捕获异常
            </h2>
            <p className="text-xs text-slate-400 font-mono bg-slate-950 p-3 rounded border border-slate-800 overflow-x-auto whitespace-pre-wrap">
              {this.state.error?.message || '未知界面异常'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              重试加载页面
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('create');
  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    token: nativeReadToken() || '',
    llmApiKey: '',
    llmEndpoint: '',
    theme: 'dark'
  });
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [initialCreatePrompt, setInitialCreatePrompt] = useState<string>('');

  // 1. Register Android native push event callback for task status & download updates
  useEffect(() => {
    window.onTaskStatusUpdated = (tasksJson: string) => {
      try {
        const updatedTasks: VideoTask[] = JSON.parse(tasksJson);
        if (updatedTasks && Array.isArray(updatedTasks)) {
          setTasks(updatedTasks);
        }
      } catch (e) {
        console.error('Failed to parse task status update from native:', e);
      }
    };
    return () => {
      delete window.onTaskStatusUpdated;
    };
  }, []);

  // 2. Initial load & 3s polling timer to ensure tasks state stays in sync
  useEffect(() => {
    const syncTasks = () => {
      const loaded = nativeLoadTasks();
      if (loaded && Array.isArray(loaded) && loaded.length > 0) {
        setTasks((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(loaded)) {
            return loaded;
          }
          return prev;
        });
      }
    };
    syncTasks();
    const timer = setInterval(syncTasks, 3000);
    return () => clearInterval(timer);
  }, []);

  // 3. Sync tasks into Gallery items when SUCCESS or downloaded
  useEffect(() => {
    const successful = tasks.filter(
      (t) =>
        (t.status?.toUpperCase() === 'SUCCESS' || t.downloadState === '已下载') &&
        (t.videoUrl || t.localUri)
    );
    const galleryItems: GalleryItem[] = successful.map((t) => ({
      id: t.id,
      title: t.title || `任务 ${t.id}`,
      prompt: t.prompt,
      duration: typeof t.duration === 'number' ? `${t.duration}s` : `${t.duration}`,
      thumbnailUrl: t.localUri || t.videoUrl || '',
      videoUrl: t.videoUrl || '',
      localUri: t.localUri,
      downloadId: t.downloadId,
      downloadState: t.downloadState,
      resolution: t.resolution,
      timestamp: new Date(t.createdAt || Date.now()).toLocaleDateString(),
      createdAt: t.createdAt,
      status: t.status
    }));
    setGallery(galleryItems);
  }, [tasks]);

  // Handle Navigation
  const navigateTo = useCallback((screen: ScreenType) => {
    setCurrentScreen(screen);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Handle Apply Prompt from Agent Tab -> Create Tab
  const handleApplyPromptFromAgent = (promptText: string) => {
    setInitialCreatePrompt(promptText);
    navigateTo('create');
  };

  // Handle Generate Video from Create Screen
  const handleGenerateVideo = (_taskData: Partial<VideoTask>) => {
    setTimeout(() => {
      const loaded = nativeLoadTasks();
      if (loaded && loaded.length > 0) {
        setTasks(loaded);
      }
    }, 400);
    navigateTo('tasks');
  };

  const handleCancelTask = (taskId: string) => {
    const updated = tasks.filter((t) => t.id !== taskId);
    setTasks(updated);
    nativeSaveTasks(updated);
  };

  const handleClearHistory = () => {
    const updated = tasks.filter(
      (t) => t.status === 'QUEUED' || t.status === 'RUNNING'
    );
    setTasks(updated);
    nativeSaveTasks(updated);
  };

  const handleDeleteGalleryItem = (id: string) => {
    const updated = tasks.filter((item) => item.id !== id);
    setTasks(updated);
    nativeSaveTasks(updated);
  };

  const handleUpdateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 font-body-base selection:bg-indigo-500 selection:text-white ${settings.theme}`}>
      {/* Top Header */}
      <Header currentScreen={currentScreen} onNavigate={(s) => navigateTo(s)} />

      {/* Main Content View */}
      <div className="w-full">
        <ErrorBoundary>
          {currentScreen === 'create' && (
            <CreateScreen initialPrompt={initialCreatePrompt} onGenerate={handleGenerateVideo} />
          )}

          {currentScreen === 'agent' && (
            <AgentScreen
              onApplyPrompt={handleApplyPromptFromAgent}
              llmConfig={settings}
            />
          )}

          {currentScreen === 'tasks' && (
            <TasksScreen
              tasks={tasks}
              onCancelTask={handleCancelTask}
              onRestartTask={() => {}}
              onClearHistory={handleClearHistory}
              onSelectTask={(task) => setSelectedVideo(task)}
            />
          )}

          {currentScreen === 'gallery' && (
            <GalleryScreen
              galleryItems={gallery}
              onSelectVideo={(item) => setSelectedVideo(item)}
              onDeleteItem={handleDeleteGalleryItem}
            />
          )}

          {currentScreen === 'settings' && (
            <SettingsScreen
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
            />
          )}
        </ErrorBoundary>
      </div>

      {/* Video Modal Player */}
      <VideoModal
        item={selectedVideo}
        onClose={() => setSelectedVideo(null)}
        onReusePrompt={(promptText) => handleApplyPromptFromAgent(promptText)}
      />

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav currentScreen={currentScreen} onNavigate={(s) => navigateTo(s)} />
    </div>
  );
}
