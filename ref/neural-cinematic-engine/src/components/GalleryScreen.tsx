import React, { useState, useMemo } from 'react';
import { GalleryItem } from '../types';

interface GalleryScreenProps {
  galleryItems: GalleryItem[];
  onSelectVideo: (item: GalleryItem) => void;
  onDeleteItem?: (id: string) => void;
}

export const GalleryScreen: React.FC<GalleryScreenProps> = ({
  galleryItems,
  onSelectVideo,
  onDeleteItem,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'done' | 'generating' | 'failed'>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  const filteredItems = useMemo(() => {
    return galleryItems.filter((item) => {
      const matchesSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.prompt.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFilter =
        activeFilter === 'all' ? true : item.status === activeFilter;

      return matchesSearch && matchesFilter;
    });
  }, [galleryItems, searchQuery, activeFilter]);

  const toggleSelectCard = (id: string) => {
    if (!isSelectMode) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCardClick = (item: GalleryItem) => {
    if (isSelectMode) {
      toggleSelectCard(item.id);
    } else if (item.status === 'done') {
      onSelectVideo(item);
    }
  };

  return (
    <main id="gallery-screen-main" className="max-w-7xl mx-auto px-4 md:px-8 py-6 pt-24 pb-28">
      {/* Title Header */}
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-slate-100 tracking-tight mb-1">Video Gallery</h1>
        <p className="text-slate-400 text-sm">
          Browse and manage all rendered video sequences and generations.
        </p>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row gap-3 mb-6 items-center justify-between sticky top-16 z-40 bg-slate-950/90 backdrop-blur-md py-3 -mx-4 px-4 md:mx-0 md:px-0 border-b border-slate-900">
        <div className="relative w-full md:w-96 group">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-lg">
            search
          </span>
          <input
            id="gallery-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search prompts or IDs..."
            className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-lg pl-10 pr-4 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-slate-600 outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <span className="material-symbols-outlined text-sm">cancel</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
          {/* Filter Dropdown */}
          <div className="relative">
            <button
              id="gallery-filter-btn"
              type="button"
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeFilter !== 'all'
                  ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/50'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">filter_list</span>
              <span>
                {activeFilter === 'all' ? 'Filter' : activeFilter === 'done' ? 'Completed' : activeFilter === 'generating' ? 'Generating' : 'Failed'}
              </span>
            </button>

            {showFilterMenu && (
              <div className="absolute left-0 mt-2 w-44 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-2 z-50">
                {(['all', 'done', 'generating', 'failed'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => {
                      setActiveFilter(filter);
                      setShowFilterMenu(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-800 transition-colors flex items-center justify-between ${
                      activeFilter === filter ? 'text-indigo-400 font-semibold' : 'text-slate-300'
                    }`}
                  >
                    <span className="capitalize">{filter === 'all' ? 'All Videos' : filter}</span>
                    {activeFilter === filter && <span className="material-symbols-outlined text-sm">check</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date sort button */}
          <button
            id="gallery-date-btn"
            type="button"
            onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors whitespace-nowrap text-xs font-medium cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">calendar_today</span>
            <span>{sortOrder === 'newest' ? 'Date (New)' : 'Date (Old)'}</span>
          </button>

          <div className="h-5 w-px bg-slate-800 mx-1 hidden md:block" />

          {/* Select Toggle */}
          <button
            id="gallery-select-btn"
            type="button"
            onClick={() => {
              setIsSelectMode(!isSelectMode);
              if (isSelectMode) setSelectedIds([]);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap text-xs font-medium cursor-pointer ${
              isSelectMode
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isSelectMode ? 'done_all' : 'checklist'}
            </span>
            <span>{isSelectMode ? `Selected (${selectedIds.length})` : 'Select'}</span>
          </button>
        </div>
      </div>

      {/* Select Mode Actions Bar */}
      {isSelectMode && selectedIds.length > 0 && (
        <div className="mb-6 p-3 bg-slate-900 border border-indigo-500/50 rounded-xl flex items-center justify-between text-sm shadow-xl">
          <span className="text-indigo-300 font-semibold">{selectedIds.length} video(s) selected</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (onDeleteItem) {
                  selectedIds.forEach((id) => onDeleteItem(id));
                  setSelectedIds([]);
                }
              }}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-all flex items-center gap-1 cursor-pointer text-xs font-semibold"
            >
              <span className="material-symbols-outlined text-sm">delete</span> Delete
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700 transition-all cursor-pointer text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Gallery Grid */}
      {filteredItems.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 mt-8">
          <span className="material-symbols-outlined text-5xl mb-3 text-slate-600">movie</span>
          <p className="font-semibold text-slate-300 text-sm">No videos found</p>
          <p className="text-xs text-slate-500 mt-1">Try tweaking your search keywords or filter settings.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              id={`gallery-item-${item.id}`}
              onClick={() => handleCardClick(item)}
              className={`bg-slate-900/80 border rounded-xl overflow-hidden group transition-all duration-300 relative aspect-video flex flex-col cursor-pointer ${
                item.status === 'generating'
                  ? 'border-indigo-500/40 shadow-lg shadow-indigo-500/10'
                  : item.status === 'failed'
                  ? 'border-red-900/40 opacity-75'
                  : 'border-slate-800 hover:border-slate-700 hover:shadow-xl'
              } ${isSelectMode && selectedIds.includes(item.id) ? 'ring-2 ring-indigo-500' : ''}`}
            >
              {/* Media Preview Container */}
              <div className="relative flex-grow min-h-[110px] overflow-hidden bg-slate-950">
                {item.status === 'done' ? (
                  <>
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
                    
                    {/* Play icon overlay */}
                    {!isSelectMode && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-lg group-active:scale-95 transition-transform">
                          <span
                            className="material-symbols-outlined text-white text-2xl"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            play_arrow
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Status Badge */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-slate-900/85 backdrop-blur-md px-2 py-0.5 rounded-md border border-slate-700">
                      <span className="material-symbols-outlined text-[14px] text-emerald-400">
                        check_circle
                      </span>
                    </div>
                  </>
                ) : item.status === 'generating' ? (
                  <div className="relative h-full flex flex-col items-center justify-center bg-slate-900 animate-pulse p-4 text-center">
                    <span className="material-symbols-outlined text-slate-400 text-3xl animate-spin mb-1">
                      model_training
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Generating...</span>
                    
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-slate-900/80 backdrop-blur-md px-2 py-0.5 rounded-md border border-indigo-500/50">
                      <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                    </div>
                  </div>
                ) : (
                  <div className="relative h-full flex flex-col items-center justify-center bg-slate-900/80 p-4">
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <span className="material-symbols-outlined text-red-400 text-3xl">error</span>
                    </div>
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-slate-900/80 backdrop-blur-md px-2 py-0.5 rounded-md border border-red-500/50">
                      <span className="material-symbols-outlined text-[14px] text-red-400">cancel</span>
                    </div>
                  </div>
                )}

                {/* Selection Checkbox */}
                {isSelectMode && (
                  <div
                    className={`absolute top-2 left-2 w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                      selectedIds.includes(item.id)
                        ? 'bg-indigo-600 border-indigo-400 text-white'
                        : 'border-white/60 bg-black/50'
                    }`}
                  >
                    {selectedIds.includes(item.id) && (
                      <span className="material-symbols-outlined text-xs font-bold">check</span>
                    )}
                  </div>
                )}
              </div>

              {/* Metadata Footer */}
              <div className="p-3 bg-slate-950 border-t border-slate-800/80">
                <p className={`text-xs font-medium truncate mb-1 ${item.status === 'failed' ? 'text-red-400' : 'text-slate-300'}`}>
                  {item.title}
                </p>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-slate-500">ID: {item.id}</span>
                  <span
                    className={`text-[10px] font-mono font-semibold ${
                      item.status === 'failed'
                        ? 'text-red-400'
                        : item.status === 'generating'
                        ? 'text-indigo-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {item.duration}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
};

