import { useState, useEffect, useCallback } from 'react';
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

  // Load initial tasks on mount
  useEffect(() => {
    const loaded = nativeLoadTasks();
    if (loaded && loaded.length > 0) {
      setTasks(loaded);
    }
  }, []);

  // Save tasks to native/localStorage on change
  useEffect(() => {
    if (tasks.length > 0) {
      nativeSaveTasks(tasks);
    }
  }, [tasks]);

  // Sync tasks into Gallery items when SUCCESS
  useEffect(() => {
    const successful = tasks.filter((t) => t.status === 'SUCCESS' && (t.videoUrl || t.localUri));
    const galleryItems: GalleryItem[] = successful.map((t) => ({
      id: t.id,
      title: `任务 ${t.id}`,
      prompt: t.prompt,
      duration: `00:0${t.duration}`,
      thumbnailUrl: t.localUri || t.videoUrl || '',
      videoUrl: t.localUri || t.videoUrl || '',
      localUri: t.localUri,
      resolution: t.resolution,
      timestamp: new Date(t.createdAt).toLocaleDateString()
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
  const handleGenerateVideo = (taskData: Partial<VideoTask>) => {
    const newTask: VideoTask = {
      id: `TSK-${Math.floor(1000 + Math.random() * 9000)}`,
      prompt: taskData.prompt || '',
      status: 'QUEUED',
      resolution: taskData.resolution || '768p竖',
      duration: taskData.duration || 5,
      seed: taskData.seed,
      images: taskData.images,
      audios: taskData.audios,
      createdAt: Date.now()
    };

    setTasks((prev) => [newTask, ...prev]);
    navigateTo('tasks');
  };

  const handleCancelTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const handleClearHistory = () => {
    setTasks((prev) => prev.filter((t) => t.status === 'QUEUED' || t.status === 'RUNNING'));
  };

  const handleDeleteGalleryItem = (id: string) => {
    setGallery((prev) => prev.filter((item) => item.id !== id));
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
        {currentScreen === 'create' && (
          <CreateScreen initialPrompt={initialCreatePrompt} onGenerate={handleGenerateVideo} />
        )}

        {currentScreen === 'agent' && (
          <AgentScreen onApplyPrompt={handleApplyPromptFromAgent} />
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
      </div>

      {/* Video Modal Player */}
      <VideoModal item={selectedVideo} onClose={() => setSelectedVideo(null)} />

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav currentScreen={currentScreen} onNavigate={(s) => navigateTo(s)} />
    </div>
  );
}
