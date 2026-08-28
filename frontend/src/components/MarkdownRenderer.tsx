import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  onApplyPrompt?: (promptText: string) => void;
  normalizeStructuredPrompt?: boolean;
}

export function ensureStructuredPromptCodeBlock(content: string): string {
  if (content.includes("```")) return content;
  const marker = /(^|\n)\s*integrated_multimodal_description\s*:/i.exec(content);
  if (!marker || marker.index < 0) return content;

  const markerStart = marker.index + marker[0].indexOf("integrated_multimodal_description");
  const before = content.slice(0, markerStart).trimEnd();
  const remainder = content.slice(markerStart);
  const trailingHeading = /\n\s*(?:#{1,6}\s*)?(?:assumptions?|unresolved requirements|假设|未解决需求)\s*:?/i.exec(remainder);
  const prompt = (trailingHeading ? remainder.slice(0, trailingHeading.index) : remainder).trim();
  const after = trailingHeading ? remainder.slice(trailingHeading.index).trimStart() : "";
  if (!prompt) return content;

  const prefix = before ? `${before}\n\n` : "";
  const suffix = after ? `\n\n${after}` : "";
  return `${prefix}\`\`\`\n${prompt}\n\`\`\`${suffix}`;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  onApplyPrompt,
  normalizeStructuredPrompt = false,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="relative group text-xs font-mono leading-relaxed space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, className, children, ...props }: any) {
            const codeString = String(children).replace(/\n$/, '');
            const hasLang = Boolean(className && /language-/.test(className));
            const isMultiline = codeString.includes('\n');
            const isInline = !hasLang && !isMultiline;

            if (isInline) {
              return (
                <code
                  className="bg-indigo-950/80 text-indigo-200 px-1.5 py-0.5 rounded text-[11px] font-mono border border-indigo-500/20"
                  {...props}
                >
                  {children}
                </code>
              );
            }

            const isStructuredPrompt =
              codeString.includes('integrated_multimodal_description:') ||
              codeString.includes('overall_soundscape:') ||
              codeString.includes('scene_description:');
            const title = isStructuredPrompt
              ? 'MiniMax-H3 Structured Prompt'
              : (className ? className.replace('language-', '') : '代码块');

            return (
              <div className="relative group my-2 rounded-xl bg-slate-950 border border-indigo-500/30 overflow-hidden shadow-inner">
                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[10px] text-slate-400 font-sans">
                  <span>{title}</span>
                  <button
                    type="button"
                    onClick={() => void handleCopyCode(codeString)}
                    className="flex items-center gap-1 hover:text-indigo-300 transition-colors cursor-pointer"
                    title="复制代码块"
                  >
                    {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCode ? '已复制' : '复制代码块'}</span>
                  </button>
                </div>
                <pre className="p-3 overflow-x-auto text-[11px] text-slate-200 leading-relaxed font-mono whitespace-pre-wrap">
                  <code>{codeString}</code>
                </pre>
              </div>
            );
          },
          p({ children }) {
            return <p className="mb-1.5 whitespace-pre-wrap">{children}</p>;
          },
          ul({ children }) {
            return <ul className="list-disc list-inside space-y-1 my-1 text-slate-300">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal list-inside space-y-1 my-1 text-slate-300">{children}</ol>;
          }
        }}
      >
        {normalizeStructuredPrompt ? ensureStructuredPromptCodeBlock(content) : content}
      </ReactMarkdown>
    </div>
  );
};
