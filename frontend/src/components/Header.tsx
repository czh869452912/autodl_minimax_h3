import React from 'react';
import { ScreenType } from '../types';

interface HeaderProps {
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentScreen, onNavigate }) => {
  const tabs: { id: ScreenType; label: string }[] = [
    { id: 'create', label: '生成' },
    { id: 'agent', label: 'Prompt助手' },
    { id: 'tasks', label: '任务队列' },
    { id: 'gallery', label: '结果' },
    { id: 'settings', label: '设置' }
  ];

  return (
    <header
      id="top-app-bar"
      className="fixed top-0 left-0 w-full z-50 flex items-center justify-between px-6 md:px-8 h-16 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 transition-all duration-200"
    >
      {/* Brand / Title */}
      <div
        className="flex items-center space-x-3 cursor-pointer"
        onClick={() => onNavigate('create')}
      >
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <div className="w-3.5 h-3.5 bg-white rounded-sm rotate-45"></div>
        </div>
        <span className="text-lg font-bold tracking-tight text-slate-100 font-mono">
          AutoDL <span className="text-indigo-400">H3</span>
        </span>
      </div>

      {/* Desktop Navigation Links */}
      <nav id="desktop-header-nav" className="hidden md:flex items-center space-x-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onNavigate(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
              currentScreen === tab.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  );
};
