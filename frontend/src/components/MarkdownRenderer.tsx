import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  onApplyPrompt?: (promptText: string) => void;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  onApplyPrompt
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group text-xs font-mono leading-relaxed space-y-2">
      {/* Action Toolbar for copying / applying whole message */}
      <div className="flex items-center justify-end gap-2 mb-1 border-b border-slate-700/40 pb-1 text-[11px] text-slate-400">
        <button
          type="button"
          onClick={() => handleCopy(content)}
          className="flex items-center gap-1 hover:text-indigo-300 transition-colors cursor-pointer px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/50"
          title="复制完整 Markdown"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400 font-sans">已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 text-slate-400" />
              <span className="font-sans">复制框内内容</span>
            </>
          )}
        </button>
      </div>

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
                    onClick={() => handleCopy(codeString)}
                    className="flex items-center gap-1 hover:text-indigo-300 transition-colors cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>复制代码块</span>
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
        {content}
      </ReactMarkdown>
    </div>
  );
};
