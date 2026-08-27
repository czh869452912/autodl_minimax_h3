import React from 'react';
import { ScreenType } from '../types';

interface BottomNavProps {
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentScreen, onNavigate }) => {
  return (
    <nav
      id="bottom-nav-bar"
      className="md:hidden fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-3 bg-slate-900/95 backdrop-blur-xl rounded-t-xl shadow-2xl border-t border-slate-800"
    >
      {/* Create */}
      <a
        id="bottom-nav-create"
        href="#create"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('create');
        }}
        className={`flex flex-col items-center justify-center transition-all active:scale-90 ${
          currentScreen === 'create'
            ? 'bg-indigo-600 text-white rounded-full px-4 py-1.5 shadow-lg shadow-indigo-600/30'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <span className="material-symbols-outlined text-[20px]">movie_filter</span>
        <span className="font-label-caps text-[10px] font-semibold tracking-wider mt-0.5">Create</span>
      </a>

      {/* Gallery */}
      <a
        id="bottom-nav-gallery"
        href="#gallery"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('gallery');
        }}
        className={`flex flex-col items-center justify-center transition-all active:scale-90 ${
          currentScreen === 'gallery'
            ? 'bg-indigo-600 text-white rounded-full px-4 py-1.5 shadow-lg shadow-indigo-600/30'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <span
          className="material-symbols-outlined text-[20px]"
          style={currentScreen === 'gallery' ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          grid_view
        </span>
        <span className="font-label-caps text-[10px] font-semibold tracking-wider mt-0.5">Gallery</span>
      </a>

      {/* Tasks */}
      <a
        id="bottom-nav-tasks"
        href="#tasks"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('tasks');
        }}
        className={`flex flex-col items-center justify-center transition-all active:scale-90 ${
          currentScreen === 'tasks'
            ? 'bg-indigo-600 text-white rounded-full px-4 py-1.5 shadow-lg shadow-indigo-600/30'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <span
          className="material-symbols-outlined text-[20px]"
          style={currentScreen === 'tasks' ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          list_alt
        </span>
        <span className="font-label-caps text-[10px] font-semibold tracking-wider mt-0.5">Tasks</span>
      </a>

      {/* Settings */}
      <a
        id="bottom-nav-settings"
        href="#settings"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('settings');
        }}
        className={`flex flex-col items-center justify-center transition-all active:scale-90 ${
          currentScreen === 'settings'
            ? 'bg-indigo-600 text-white rounded-full px-4 py-1.5 shadow-lg shadow-indigo-600/30'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <span
          className="material-symbols-outlined text-[20px]"
          style={currentScreen === 'settings' ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          settings
        </span>
        <span className="font-label-caps text-[10px] font-semibold tracking-wider mt-0.5">Settings</span>
      </a>
    </nav>
  );
};

