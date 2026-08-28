import React from 'react';
import { ScreenType } from '../types';

interface BottomNavProps {
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentScreen, onNavigate }) => {
  const tabs: { id: ScreenType; label: string; icon: string }[] = [
    { id: 'create', label: '生成', icon: 'movie_filter' },
    { id: 'agent', label: 'Prompt助手', icon: 'smart_toy' },
    { id: 'tasks', label: '任务队列', icon: 'list_alt' },
    { id: 'gallery', label: '结果', icon: 'grid_view' },
    { id: 'settings', label: '设置', icon: 'settings' }
  ];

  return (
    <nav
      id="bottom-nav-bar"
      className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-2 pb-5 pt-2 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 shadow-2xl"
    >
      {tabs.map((tab) => {
        const isActive = currentScreen === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onNavigate(tab.id)}
            className={`flex flex-col items-center justify-center transition-all active:scale-95 px-2 py-1 rounded-xl ${
              isActive
                ? 'bg-indigo-600/90 text-white shadow-lg shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span
              className="material-symbols-outlined text-[20px]"
              style={isActive ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {tab.icon}
            </span>
            <span className="text-[10px] font-semibold tracking-wider mt-0.5">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
