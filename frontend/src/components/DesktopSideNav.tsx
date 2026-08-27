import React from 'react';
import { ScreenType } from '../types';

interface DesktopSideNavProps {
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
}

export const DesktopSideNav: React.FC<DesktopSideNavProps> = ({ currentScreen, onNavigate }) => {
  return (
    <nav
      id="desktop-side-nav"
      className="hidden md:flex flex-col fixed left-0 top-16 h-[calc(100vh-4rem)] w-20 bg-slate-900/60 border-r border-slate-800 py-6 items-center space-y-4 z-40 backdrop-blur-md"
    >
      <a
        id="side-nav-create"
        href="#create"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('create');
        }}
        className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all ${
          currentScreen === 'create'
            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/50 shadow-lg shadow-indigo-500/10'
            : 'text-slate-400 hover:text-white hover:bg-slate-800'
        }`}
      >
        <span className="material-symbols-outlined text-[22px]">movie_filter</span>
        <span className="font-label-caps text-[9px] mt-1 font-semibold tracking-wider">Create</span>
      </a>

      <a
        id="side-nav-gallery"
        href="#gallery"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('gallery');
        }}
        className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all ${
          currentScreen === 'gallery'
            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/50 shadow-lg shadow-indigo-500/10'
            : 'text-slate-400 hover:text-white hover:bg-slate-800'
        }`}
      >
        <span
          className="material-symbols-outlined text-[22px]"
          style={currentScreen === 'gallery' ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          grid_view
        </span>
        <span className="font-label-caps text-[9px] mt-1 font-semibold tracking-wider">Gallery</span>
      </a>

      <a
        id="side-nav-tasks"
        href="#tasks"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('tasks');
        }}
        className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all ${
          currentScreen === 'tasks'
            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/50 shadow-lg shadow-indigo-500/10'
            : 'text-slate-400 hover:text-white hover:bg-slate-800'
        }`}
      >
        <span
          className="material-symbols-outlined text-[22px]"
          style={currentScreen === 'tasks' ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          list_alt
        </span>
        <span className="font-label-caps text-[9px] mt-1 font-semibold tracking-wider">Tasks</span>
      </a>

      <a
        id="side-nav-settings"
        href="#settings"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('settings');
        }}
        className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl transition-all mt-auto ${
          currentScreen === 'settings'
            ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/50 shadow-lg shadow-indigo-500/10'
            : 'text-slate-400 hover:text-white hover:bg-slate-800'
        }`}
      >
        <span
          className="material-symbols-outlined text-[22px]"
          style={currentScreen === 'settings' ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          settings
        </span>
        <span className="font-label-caps text-[9px] mt-1 font-semibold tracking-wider">Settings</span>
      </a>
    </nav>
  );
};

