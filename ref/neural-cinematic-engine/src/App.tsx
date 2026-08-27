import { useState, useEffect, useCallback } from 'react';
import { ScreenType, VideoTask, GalleryItem, AppSettings } from './types';
import { initialTasks, initialGallery, initialSettings } from './mockData';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { DesktopSideNav } from './components/DesktopSideNav';
import { CreateScreen } from './components/CreateScreen';
import { TasksScreen } from './components/TasksScreen';
import { GalleryScreen } from './components/GalleryScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { VideoModal } from './components/VideoModal';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('create');
  const [tasks, setTasks] = useState<VideoTask[]>(initialTasks);
  const [gallery, setGallery] = useState<GalleryItem[]>(initialGallery);
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [selectedVideo, setSelectedVideo] = useState<GalleryItem | VideoTask | null>(null);
  const [transitionType, setTransitionType] = useState<'none' | 'push'>('none');

  // Navigation helper
  const navigateTo = useCallback((screen: ScreenType, transition: 'none' | 'push' = 'none') => {
    setTransitionType(transition);
    setCurrentScreen(screen);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Handle Generate Video from Create Screen
  const handleGenerateVideo = (taskData: Partial<VideoTask>) => {
    const idCode = Math.floor(1000 + Math.random() * 9000);
    const newId = `TSK-${idCode}-Z`;
    const newTask: VideoTask = {
      id: newId,
      title: taskData.title || 'Generated Scene',
      prompt: taskData.prompt || 'Cinematic video scene',
      status: 'rendering',
      progress: 12,
      step: 'Step 6/50',
      eta: 'ETA: 1m 45s',
      aspectRatio: taskData.aspectRatio || '9:16',
      duration: taskData.duration || 5,
      model: taskData.model || 'MiniMax H3 (Latest)',
      timeAgo: 'Just now',
      createdAt: Date.now(),
      thumbnailUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAlcASUKc_uWo4D9YiBLr85EKNrDX5SPD9dMOSvpt_zS7rHjhMWipMITl0BkDHnZEpF_nfNoHv8HGUmUeKaYNhJoqtmFRR9omZ9qjBidImoGhM701bkoxSJmMw9V8Wc_ki9twbne81nWMv1gPPn9trQgEJzJQ7ju2ZEDNzkLABcVeba94exR5OJ0WojgslJpyGkl6sDbwCIn3v-fSawrie993BGBKzuqNJiPac8GVQ3BU93WgWVatJv'
    };

    setTasks((prev) => [newTask, ...prev]);
    // Push transition to Tasks screen as specified
    navigateTo('tasks', 'push');
  };

  // Background progress simulation for active rendering tasks
  useEffect(() => {
    const interval = setInterval(() => {
      setTasks((prevTasks) => {
        let hasChanges = false;
        const updated = prevTasks.map((t) => {
          if (t.status === 'rendering') {
            const cur = t.progress || 0;
            if (cur < 95) {
              hasChanges = true;
              const next = cur + 6;
              return {
                ...t,
                progress: next,
                step: `Step ${Math.min(50, Math.floor((next / 100) * 50))}/50`,
                eta: `ETA: ${Math.max(5, Math.floor((100 - next) * 0.8))}s`
              };
            } else {
              hasChanges = true;
              // Complete task
              const completedTask: VideoTask = {
                ...t,
                status: 'done',
                progress: 100,
                timeAgo: 'Just now'
              };
              // Add to gallery
              setGallery((g) => [
                {
                  id: t.id.replace('TSK-', ''),
                  title: t.title,
                  prompt: t.prompt,
                  status: 'done',
                  duration: `00:0${t.duration || 5}`,
                  thumbnailUrl: t.thumbnailUrl || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAlcASUKc_uWo4D9YiBLr85EKNrDX5SPD9dMOSvpt_zS7rHjhMWipMITl0BkDHnZEpF_nfNoHv8HGUmUeKaYNhJoqtmFRR9omZ9qjBidImoGhM701bkoxSJmMw9V8Wc_ki9twbne81nWMv1gPPn9trQgEJzJQ7ju2ZEDNzkLABcVeba94exR5OJ0WojgslJpyGkl6sDbwCIn3v-fSawrie993BGBKzuqNJiPac8GVQ3BU93WgWVatJv',
                  aspectRatio: t.aspectRatio,
                  timestamp: 'Just now'
                },
                ...g
              ]);
              return completedTask;
            }
          }
          return t;
        });
        return hasChanges ? updated : prevTasks;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const handleCancelTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const handleRestartTask = (taskId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: 'rendering',
              progress: 5,
              step: 'Step 2/50',
              eta: 'ETA: 1m 50s',
              timeAgo: 'Restarted just now'
            }
          : t
      )
    );
  };

  const handleClearHistory = () => {
    setTasks((prev) => prev.filter((t) => t.status === 'rendering' || t.status === 'queuing'));
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
      <Header currentScreen={currentScreen} onNavigate={(s) => navigateTo(s, 'none')} />

      {/* Desktop Side Navigation on Tasks screen & always available for md+ */}
      {currentScreen === 'tasks' && (
        <DesktopSideNav currentScreen={currentScreen} onNavigate={(s) => navigateTo(s, 'none')} />
      )}

      {/* Main Content View with transition animation */}
      <div
        className={`w-full transition-all duration-300 ${
          transitionType === 'push' ? 'animate-in fade-in slide-in-from-right-4 duration-300' : ''
        }`}
      >
        {currentScreen === 'create' && (
          <CreateScreen onGenerate={handleGenerateVideo} />
        )}

        {currentScreen === 'tasks' && (
          <TasksScreen
            tasks={tasks}
            onCancelTask={handleCancelTask}
            onRestartTask={handleRestartTask}
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
      <BottomNav currentScreen={currentScreen} onNavigate={(s) => navigateTo(s, 'none')} />
    </div>
  );
}
