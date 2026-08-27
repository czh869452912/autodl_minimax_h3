import { VideoTask, GalleryItem, AppSettings } from './types';

export const initialTasks: VideoTask[] = [
  {
    id: 'TSK-8921-X',
    title: 'Cyberpunk Cityscape Pan',
    prompt: 'Cinematic drone shot soaring through a dense futuristic cyberpunk metropolis in rain, towering holograms reflecting on wet skyscrapers.',
    status: 'rendering',
    progress: 64,
    step: 'Step 32/50',
    eta: 'ETA: 45s',
    aspectRatio: '16:9',
    duration: 5,
    model: 'MiniMax H3 (Latest)',
    timeAgo: 'Just now',
    createdAt: Date.now() - 45000,
    thumbnailUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAlcASUKc_uWo4D9YiBLr85EKNrDX5SPD9dMOSvpt_zS7rHjhMWipMITl0BkDHnZEpF_nfNoHv8HGUmUeKaYNhJoqtmFRR9omZ9qjBidImoGhM701bkoxSJmMw9V8Wc_ki9twbne81nWMv1gPPn9trQgEJzJQ7ju2ZEDNzkLABcVeba94exR5OJ0WojgslJpyGkl6sDbwCIn3v-fSawrie993BGBKzuqNJiPac8GVQ3BU93WgWVatJv'
  },
  {
    id: 'TSK-8922-Y',
    title: 'Neon Portrait - Subject A',
    prompt: 'Close up portrait of a cyberpunk hacker illuminated with intense purple and cyan rim lighting.',
    status: 'queuing',
    queuePosition: 3,
    step: '--',
    aspectRatio: '9:16',
    duration: 8,
    model: 'MiniMax H3 (Latest)',
    timeAgo: '2m ago',
    createdAt: Date.now() - 120000,
  },
  {
    id: 'TSK-8919-W',
    title: 'Neon Alley Walkthrough',
    prompt: 'First-person steadycam walkthrough in a narrow Tokyo alley with neon signs and glowing lanterns in rain.',
    status: 'done',
    timeAgo: '10m ago',
    aspectRatio: '16:9',
    duration: 15,
    model: 'MiniMax H3 (Latest)',
    thumbnailUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCGH2JSmhpDG_a77Pq-1loaqkDqgeF6Az4zvKS2nkjYN-ks5G1IUzSArv9Nu7UaK7KBQYyxBIn08xsVAEXG1YNWbwBP85we34USgdJJRnyqn8M8hVoPFLDNWjsQqVeItY3TU9iYRG4FMtTjMPF5Hp_abh_C6bblZQhrDp_vrY2Wcm1rLwHcY_hPyFajCkETC0XboNeNz6KPqh3Xzi1A5S6lKU4NiQjha3VKmAPnHj55iZzftv6_Mjpr',
    createdAt: Date.now() - 600000,
  },
  {
    id: 'TSK-8918-V',
    title: 'Abstract Data Flow 4K',
    prompt: 'Complex 3D data stream particles rushing through optical neural fibers with deep depth of field.',
    status: 'failed',
    errorReason: 'VRAM exhaustion error',
    timeAgo: '1h ago',
    aspectRatio: '16:9',
    duration: 10,
    model: 'MiniMax H3 (Latest)',
    createdAt: Date.now() - 3600000,
  },
  {
    id: 'TSK-8910-U',
    title: 'Bioluminescent Forest',
    prompt: 'Ancient towering sacred tree in an enchanted twilight forest glowing with purple spores and blue moss.',
    status: 'done',
    timeAgo: '3h ago',
    aspectRatio: '16:9',
    duration: 8,
    model: 'MiniMax H3 (Latest)',
    thumbnailUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA9QeVrT1IRbuW8EwLHXIZ8IYzE9YbLYxec5eGWoEJaMoibY7C2KB3eYynt3mOsbUU4FZ5p9dUAF8vGwtSwqkUy3WG2pn4dXzaJPiTMrVSWzQfcWos6nbDAPi2wHpzjEijr4wOpemfzdxFObWY92cXq3sESYvYJhTuJ8D9lKf-Ub6Rx3pxT8j8e_Y8-I-gyyEoOFiU5JKGUoi741JBv1xpC9kCxYCouH0Ie6u4bELqkqdbGqlU5lk9g',
    createdAt: Date.now() - 10800000,
  }
];

export const initialGallery: GalleryItem[] = [
  {
    id: '8F92A',
    title: 'Cyberpunk Cityscape Flythrough',
    prompt: 'A highly detailed cinematic shot of a futuristic cyberpunk city at night, neon lights reflecting on wet streets.',
    status: 'done',
    duration: '00:15',
    thumbnailUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAlcASUKc_uWo4D9YiBLr85EKNrDX5SPD9dMOSvpt_zS7rHjhMWipMITl0BkDHnZEpF_nfNoHv8HGUmUeKaYNhJoqtmFRR9omZ9qjBidImoGhM701bkoxSJmMw9V8Wc_ki9twbne81nWMv1gPPn9trQgEJzJQ7ju2ZEDNzkLABcVeba94exR5OJ0WojgslJpyGkl6sDbwCIn3v-fSawrie993BGBKzuqNJiPac8GVQ3BU93WgWVatJv',
    aspectRatio: '16:9',
    timestamp: 'Today, 22:15'
  },
  {
    id: '4B21C',
    title: 'Neon Portrait Sequence',
    prompt: 'Neon Portrait - Subject A in glowing rain studio setup.',
    status: 'generating',
    progress: 45,
    duration: '45%',
    thumbnailUrl: '',
    aspectRatio: '9:16',
    timestamp: 'Generating...'
  },
  {
    id: '1A77E',
    title: 'Mechanical Bioluminescence',
    prompt: 'A macro shot of intricate mechanical clockwork gears glowing with a faint blue bioluminescence.',
    status: 'done',
    duration: '00:08',
    thumbnailUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA_MKv2Nldl63N82lrXjAlHCIEBozeFZfhPExUh9im846qU-h68LG5M_V4iFc9hzrdYg0TjP2u-D6k5h-NlYx4-yKIYysQYcKM0goZQu2ZWIfAUVany_wc_U2aI3op2aOKNrj0_Lo5tXqeX5U5dJxbPyuymkrWThF91P0eeRrB80KkZays2-ZGkodZ3o48UcvVxwaZqU5jWjMYpHs4xmoAQn-fLRR54aFP0SiGbEkq_iOcU2XikuYq_',
    aspectRatio: '16:9',
    timestamp: 'Yesterday'
  },
  {
    id: '9X32F',
    title: 'Abstract Fluid Dynamics',
    prompt: 'Simulated high viscosity liquid metal droplets colliding at supersonic speeds.',
    status: 'failed',
    duration: 'FAILED',
    thumbnailUrl: '',
    aspectRatio: '16:9',
    timestamp: '2 days ago'
  },
  {
    id: '5L90P',
    title: 'Crystal Floating Islands',
    prompt: 'A surreal landscape featuring floating islands of geometric crystal formations over a sea of liquid silver.',
    status: 'done',
    duration: '00:24',
    thumbnailUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBcD7kUweLxsbXwDUefkEPybrBDv2kmcajIIJnruEzdVXBPb2A36J9OoRXjBYm9dxR1327iuAsOV7YeJVXgl-B5RvHmXacPjpqJvibdaHBCiZe9AK6vZT2Ld9GjfnDKFhdUmf4o8qDf4tJRvBanfLWC4NJfWide5_Y5zVZ1s1ltSur-p9wFQq8Hz2NkpMsx_JNcCtkkgYZIBpn0fGi2ZWvy-4fhibY6cvi0MCzKLP-6ucZqX7NtaGEU',
    aspectRatio: '16:9',
    timestamp: '3 days ago'
  },
  {
    id: '3K44Z',
    title: 'Neon Alley Walkthrough',
    prompt: 'Atmospheric moody cyberpunk street with reflections on wet pavement.',
    status: 'done',
    duration: '00:10',
    thumbnailUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCGH2JSmhpDG_a77Pq-1loaqkDqgeF6Az4zvKS2nkjYN-ks5G1IUzSArv9Nu7UaK7KBQYyxBIn08xsVAEXG1YNWbwBP85we34USgdJJRnyqn8M8hVoPFLDNWjsQqVeItY3TU9iYRG4FMtTjMPF5Hp_abh_C6bblZQhrDp_vrY2Wcm1rLwHcY_hPyFajCkETC0XboNeNz6KPqh3Xzi1A5S6lKU4NiQjha3VKmAPnHj55iZzftv6_Mjpr',
    aspectRatio: '16:9',
    timestamp: '4 days ago'
  },
  {
    id: '7M12B',
    title: 'Bioluminescent Ancient Forest',
    prompt: 'Lush alien forest with glowing neon organisms and mystical mist.',
    status: 'done',
    duration: '00:12',
    thumbnailUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA9QeVrT1IRbuW8EwLHXIZ8IYzE9YbLYxec5eGWoEJaMoibY7C2KB3eYynt3mOsbUU4FZ5p9dUAF8vGwtSwqkUy3WG2pn4dXzaJPiTMrVSWzQfcWos6nbDAPi2wHpzjEijr4wOpemfzdxFObWY92cXq3sESYvYJhTuJ8D9lKf-Ub6Rx3pxT8j8e_Y8-I-gyyEoOFiU5JKGUoi741JBv1xpC9kCxYCouH0Ie6u4bELqkqdbGqlU5lk9g',
    aspectRatio: '16:9',
    timestamp: '5 days ago'
  }
];

export const initialSettings: AppSettings = {
  apiKey: 'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
  apiSecret: '',
  theme: 'dark',
  outputQuality: '1080p (Standard)',
  notifications: true,
  cacheSizeMB: 4200,
  computeCredits: 2450
};

export const samplePrompts = [
  'Cinematic drone shot soaring through a dense futuristic cyberpunk metropolis in rain, towering neon holograms reflecting on wet skyscrapers.',
  'Cyberpunk city rain with reflections of colorful neon signs and steam rising from city grates.',
  'Macro nature time-lapse of crystalline frost spreading across a blooming nocturnal flower in moonlight.',
  'Ultra-detailed steampunk airship cruising through golden clouds at sunset with brass gears turning.',
  'Liquid crystal particles forming a morphing geometric sphere in zero gravity.'
];
