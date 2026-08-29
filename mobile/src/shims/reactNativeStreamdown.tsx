import { useMemo } from 'react';
import { EnrichedMarkdownText } from 'react-native-enriched-markdown';
import remend from 'remend';

type StreamdownTextProps = {
  markdown: string;
  remendConfig?: Record<string, unknown>;
  selectable?: boolean;
  streamingAnimation?: boolean;
  [key: string]: unknown;
};

/** Thin Expo compatibility adapter around Streamdown's two mature primitives. */
export function StreamdownText({ markdown, remendConfig, selectable = true, streamingAnimation = true, ...props }: StreamdownTextProps) {
  const processedMarkdown = useMemo(() => remend(markdown, remendConfig as never), [markdown, remendConfig]);
  const enrichedProps = props as any;
  return <EnrichedMarkdownText {...enrichedProps} markdown={processedMarkdown} streamingAnimation={streamingAnimation} selectable={selectable} />;
}
