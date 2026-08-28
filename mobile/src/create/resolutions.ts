/** Values accepted by minimax_h3_image_audio_to_video_v2_15s. */
export const RESOLUTION_OPTIONS = ['768p竖', '480p竖', '768p横', '480p横'] as const;
export type Resolution = (typeof RESOLUTION_OPTIONS)[number];
