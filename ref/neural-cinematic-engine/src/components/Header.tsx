import React from 'react';
import { ScreenType } from '../types';

interface HeaderProps {
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentScreen, onNavigate }) => {
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
        <span className="text-lg font-bold tracking-tight text-slate-100">
          VISION<span className="text-indigo-400">AI</span>
        </span>
      </div>

      {/* Screen subtitle on tasks if mobile/tablet */}
      {currentScreen === 'tasks' && (
        <div className="md:hidden text-slate-300 font-headline-md font-semibold text-sm">Tasks</div>
      )}

      {/* Desktop Navigation Links inside header */}
      <nav id="desktop-header-nav" className="hidden md:flex items-center space-x-1">
        <a
          id="header-nav-create"
          href="#create"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('create');
          }}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            currentScreen === 'create'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Create
        </a>

        <a
          id="header-nav-gallery"
          href="#gallery"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('gallery');
          }}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            currentScreen === 'gallery'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Gallery
        </a>

        <a
          id="header-nav-tasks"
          href="#tasks"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('tasks');
          }}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            currentScreen === 'tasks'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Tasks
        </a>

        <a
          id="header-nav-settings"
          href="#settings"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('settings');
          }}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            currentScreen === 'settings'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Settings
        </a>
      </nav>

      {/* Right User Badge / Actions */}
      <div className="flex items-center space-x-4">
        <div className="hidden sm:flex flex-col items-end">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pro Plan</span>
          <span className="text-xs font-medium text-slate-200">Sarah Jenkins</span>
        </div>
        <div
          onClick={() => onNavigate('settings')}
          className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 border-2 border-slate-800 shadow-lg cursor-pointer hover:opacity-90 transition-opacity flex items-center justify-center text-white text-xs font-bold"
        >
          SJ
        </div>
      </div>
    </header>
  );
};

