import React, { useState } from 'react';
import { AppSettings } from '../types';

interface SettingsScreenProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [apiSecret, setApiSecret] = useState(settings.apiSecret);
  const [theme, setTheme] = useState(settings.theme);
  const [quality, setQuality] = useState(settings.outputQuality);
  const [notifications, setNotifications] = useState(settings.notifications);
  const [cacheSize, setCacheSize] = useState(settings.cacheSizeMB);
  const [credits, setCredits] = useState(settings.computeCredits);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 3000);
  };

  const handleSaveCredentials = () => {
    onUpdateSettings({ apiKey, apiSecret });
    showFeedback('API Credentials saved securely.');
  };

  const handleTopUp = () => {
    const updated = credits + 500;
    setCredits(updated);
    onUpdateSettings({ computeCredits: updated });
    showFeedback('+500 Compute Units added to your account.');
  };

  const handleClearCache = () => {
    setCacheSize(0);
    onUpdateSettings({ cacheSizeMB: 0 });
    showFeedback('Local cache cleared successfully.');
  };

  return (
    <main id="settings-screen-main" className="max-w-4xl mx-auto px-4 lg:px-0 py-8 pt-24 pb-28 flex flex-col gap-8 md:pl-24">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold text-slate-100 tracking-tight">Configuration</h1>
        <p className="text-slate-400 text-sm">
          Manage your AI Studio environment, credentials, and render preferences.
        </p>
      </div>

      {/* Save Feedback Banner */}
      {saveToast && (
        <div className="p-3 bg-indigo-500/10 border border-indigo-500/40 rounded-xl text-indigo-200 flex items-center justify-between text-sm shadow-lg">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-400 text-base">check_circle</span>
            <span>{saveToast}</span>
          </div>
          <button onClick={() => setSaveToast(null)} className="text-slate-400 hover:text-white">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Account Info Card */}
        <section className="md:col-span-5 bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4 shadow-lg">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5 mb-4">
              <span className="material-symbols-outlined text-[18px] text-indigo-400">account_circle</span>
              Account
            </h2>
            <div className="flex items-center gap-4 mt-2">
              <div className="w-14 h-14 rounded-full overflow-hidden border border-slate-700 relative shadow-md shrink-0">
                <img
                  className="object-cover w-full h-full"
                  data-alt="Creator Profile Avatar"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuA4cna_0jZ4S1PH0ABgQEFeEGcDKoT-F0BudxVEr7I-ARgrU2es7K8zCsdSAaHrGLWNIva5MmqHv3hI91pZeE3Gs-_6fXCnFSUoHnXsNgDLyJCoWA1AvZXiS4tHKzwWx7cGRdL_SNp7CtWhml1U0nI14_8dCl85GAXUy9MZnxjQbf7AQTl0cF8QYX9dLNGUCvwGli7aLgtmoxyjGTZMs4i-_XR6TSvR4Pl4hriXyctb91ZiATN_W_1R"
                  alt="Creator Avatar"
                />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-slate-100 text-sm">Creator Profile</span>
                <span className="text-indigo-400 font-mono text-xs font-medium">Pro Tier License</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center">
            <div className="flex flex-col">
              <span className="text-slate-500 font-mono text-[10px] uppercase tracking-wider">Compute Balance</span>
              <span className="font-mono text-indigo-400 font-bold text-sm">
                {credits.toLocaleString()} units
              </span>
            </div>
            <button
              type="button"
              id="btn-top-up-credits"
              onClick={handleTopUp}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-semibold text-xs text-white transition-colors active:scale-95 cursor-pointer shadow-md shadow-indigo-600/20"
            >
              Top Up
            </button>
          </div>
        </section>

        {/* API Config Card */}
        <section className="md:col-span-7 bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4 relative overflow-hidden shadow-lg">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px] text-indigo-400">key</span>
            MiniMax H3 Integration
          </h2>
          <p className="text-slate-400 text-xs max-w-md leading-relaxed">
            Connect your MiniMax credentials to enable advanced neural video generation capabilities. Keys are securely stored locally.
          </p>

          <div className="flex flex-col gap-1.5">
            <label className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">API Key</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">
                vpn_key
              </span>
              <input
                id="api-key-input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-10 pr-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder-slate-600"
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-slate-400 font-mono text-[10px] uppercase tracking-wider">API Secret</label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-[18px]">
                lock
              </span>
              <input
                id="api-secret-input"
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                placeholder="Enter Secret Key..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-10 pr-3 font-mono text-xs text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors placeholder-slate-600"
              />
            </div>
          </div>

          <div className="mt-1 flex justify-end">
            <button
              type="button"
              id="btn-save-credentials"
              onClick={handleSaveCredentials}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold text-xs text-white transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/20"
            >
              <span className="material-symbols-outlined text-[16px]">save</span>
              Save Credentials
            </button>
          </div>
        </section>

        {/* App Preferences */}
        <section className="md:col-span-12 bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4 shadow-lg">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px] text-indigo-400">tune</span>
            Preferences
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
            {/* Column 1 */}
            <div className="flex flex-col gap-5">
              {/* Theme */}
              <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-slate-200 font-semibold text-xs">Interface Theme</span>
                  <span className="text-slate-500 text-[11px]">Active interface styling</span>
                </div>
                <div className="flex bg-slate-950 border border-slate-800 rounded-lg overflow-hidden p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTheme('dark');
                      onUpdateSettings({ theme: 'dark' });
                    }}
                    className={`px-3 py-1 rounded-md text-xs transition-colors flex items-center gap-1 font-semibold cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-slate-800 text-indigo-400 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">dark_mode</span> Dark
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTheme('light');
                      onUpdateSettings({ theme: 'light' });
                    }}
                    className={`px-3 py-1 rounded-md text-xs transition-colors flex items-center gap-1 font-semibold cursor-pointer ${
                      theme === 'light'
                        ? 'bg-slate-800 text-indigo-400 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">light_mode</span> Light
                  </button>
                </div>
              </div>

              {/* Quality */}
              <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-slate-200 font-semibold text-xs">Default Output Quality</span>
                  <span className="text-slate-500 text-[11px]">Neural render resolution</span>
                </div>
                <select
                  id="quality-select"
                  value={quality}
                  onChange={(e) => {
                    setQuality(e.target.value);
                    onUpdateSettings({ outputQuality: e.target.value });
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="1080p (Standard)">1080p (Standard)</option>
                  <option value="4K (High)">4K (High)</option>
                  <option value="Preview (Fast)">Preview (Fast)</option>
                </select>
              </div>
            </div>

            {/* Column 2 */}
            <div className="flex flex-col gap-5">
              {/* Notifications */}
              <div className="flex justify-between items-center">
                <div className="flex flex-col">
                  <span className="text-slate-200 font-semibold text-xs">Task Notifications</span>
                  <span className="text-slate-500 text-[11px]">Alerts when render completes</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifications}
                    onChange={(e) => {
                      setNotifications(e.target.checked);
                      onUpdateSettings({ notifications: e.target.checked });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                </label>
              </div>

              {/* Storage */}
              <div className="flex justify-between items-center">
                <div className="flex flex-col w-full gap-2">
                  <div className="flex justify-between">
                    <span className="text-slate-200 font-semibold text-xs">Local Cache</span>
                    <span className="font-mono text-xs text-indigo-400">
                      {(cacheSize / 1000).toFixed(1)} GB
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (cacheSize / 8000) * 100)}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleClearCache}
                    className="text-left text-xs text-red-400 hover:text-red-300 transition-colors w-max mt-0.5 cursor-pointer font-medium"
                  >
                    Clear Cache
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Help & Links */}
        <section className="md:col-span-12 flex flex-col sm:flex-row gap-4 justify-between items-center py-4 px-2 border-t border-slate-800 mt-2">
          <div className="flex flex-wrap gap-6">
            <a
              href="#docs"
              onClick={(e) => e.preventDefault()}
              className="text-xs text-slate-400 hover:text-indigo-400 transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">menu_book</span>
              Documentation
            </a>
            <a
              href="#github"
              onClick={(e) => e.preventDefault()}
              className="text-xs text-slate-400 hover:text-indigo-400 transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">code</span>
              GitHub Repo
            </a>
            <a
              href="#report"
              onClick={(e) => e.preventDefault()}
              className="text-xs text-slate-400 hover:text-indigo-400 transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">bug_report</span>
              Report Issue
            </a>
          </div>
          <span className="font-mono text-xs text-slate-500">v2.4.1 (Stable)</span>
        </section>
      </div>
    </main>
  );
};
