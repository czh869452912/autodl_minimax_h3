import { VideoTask, GalleryItem, AppSettings } from './types';

export const initialTasks: VideoTask[] = [
  {
    id: 'TSK-8921-X',
    prompt: 'Cinematic drone shot soaring through a dense futuristic cyberpunk metropolis in rain, towering holograms reflecting on wet skyscrapers.',
    status: 'RUNNING',
    resolution: '768p竖',
    duration: 5,
    createdAt: Date.now() - 45000,
  },
  {
    id: 'TSK-8922-Y',
    prompt: 'Close up portrait of a cyberpunk hacker illuminated with intense purple and cyan rim lighting.',
    status: 'QUEUED',
    resolution: '768p竖',
    duration: 8,
    createdAt: Date.now() - 120000,
  },
  {
    id: 'TSK-8919-W',
    prompt: 'First-person steadycam walkthrough in a narrow Tokyo alley with neon signs and glowing lanterns in rain.',
    status: 'SUCCESS',
    resolution: '768p横',
    duration: 15,
    createdAt: Date.now() - 600000,
  },
  {
    id: 'TSK-8918-V',
    prompt: 'Complex 3D data stream particles rushing through optical neural fibers with deep depth of field.',
    status: 'FAILED',
    resolution: '768p竖',
    duration: 10,
    createdAt: Date.now() - 3600000,
  }
];

export const initialGallery: GalleryItem[] = [
  {
    id: '8F92A',
    title: 'Cyberpunk Cityscape Flythrough',
    prompt: 'A highly detailed cinematic shot of a futuristic cyberpunk city at night, neon lights reflecting on wet streets.',
    duration: '00:15',
    thumbnailUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAlcASUKc_uWo4D9YiBLr85EKNrDX5SPD9dMOSvpt_zS7rHjhMWipMITl0BkDHnZEpF_nfNoHv8HGUmUeKaYNhJoqtmFRR9omZ9qjBidImoGhM701bkoxSJmMw9V8Wc_ki9twbne81nWMv1gPPn9trQgEJzJQ7ju2ZEDNzkLABcVeba94exR5OJ0WojgslJpyGkl6sDbwCIn3v-fSawrie993BGBKzuqNJiPac8GVQ3BU93WgWVatJv',
    videoUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAlcASUKc_uWo4D9YiBLr85EKNrDX5SPD9dMOSvpt_zS7rHjhMWipMITl0BkDHnZEpF_nfNoHv8HGUmUeKaYNhJoqtmFRR9omZ9qjBidImoGhM701bkoxSJmMw9V8Wc_ki9twbne81nWMv1gPPn9trQgEJzJQ7ju2ZEDNzkLABcVeba94exR5OJ0WojgslJpyGkl6sDbwCIn3v-fSawrie993BGBKzuqNJiPac8GVQ3BU93WgWVatJv',
    resolution: '768p竖',
    timestamp: 'Today, 22:15'
  }
];

export const initialSettings: AppSettings = {
  token: '',
  llmApiKey: '',
  llmEndpoint: '',
  llmModel: 'MiniMax-M2.7',
  theme: 'dark'
};

export const samplePrompts = [
  'Cinematic drone shot soaring through a dense futuristic cyberpunk metropolis in rain, towering neon holograms reflecting on wet skyscrapers.',
  'Cyberpunk city rain with reflections of colorful neon signs and steam rising from city grates.',
  'Macro nature time-lapse of crystalline frost spreading across a blooming nocturnal flower in moonlight.',
  'Ultra-detailed steampunk airship cruising through golden clouds at sunset with brass gears turning.',
  'Liquid crystal particles forming a morphing geometric sphere in zero gravity.'
];
