/**
 * Android-safe replacement for CopilotKit's XHR streaming fetch.
 *
 * CopilotKit's stock polyfill leaves the stream open when a consumer calls
 * cancel(), so a late XHR onload can call controller.close() a second time.
 * Expo's web-streams implementation throws in that case. This adapter keeps
 * the same public install function and makes terminal transitions idempotent.
 */
function abortError(): Error {
  const DomException = (globalThis as any).DOMException;
  return DomException ? new DomException('The operation was aborted.', 'AbortError') : new Error('The operation was aborted');
}

export function installStreamingFetch(): void {
  try {
    const response = new Response('');
    if (response.body && typeof response.body.getReader === 'function') return;
  } catch {
    // Older React Native runtimes do not expose a complete Response object.
  }

  const TextEncoderCtor = (globalThis as any).TextEncoder;
  const originalFetch = globalThis.fetch;
  const streamingFetch = (input: any, init?: any): Promise<Response> => {
    const url = typeof input === 'string' ? input : input?.url;
    const method = init?.method ?? input?.method ?? 'GET';
    const headers = init?.headers ?? input?.headers ?? {};
    const body = init?.body ?? input?.body ?? null;
    const signal = init?.signal ?? input?.signal;

    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(abortError()); return; }
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);
      xhr.timeout = 60_000;
      xhr.responseType = 'text';
      const entries = headers instanceof Headers ? Array.from(headers.entries()) : Object.entries(headers);
      for (const [key, value] of entries as [string, string][]) xhr.setRequestHeader(key, value);

      let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
      let response: any = null;
      let closed = false;
      let settled = false;
      let lastIndex = 0;
      let resolveText!: (value: string) => void;
      let rejectText!: (reason?: unknown) => void;
      const fullText = new Promise<string>((resolveText_, rejectText_) => { resolveText = resolveText_; rejectText = rejectText_; });
      fullText.catch(() => {});
      const encoder = new TextEncoderCtor();
      const cleanup = () => signal?.removeEventListener?.('abort', onAbort);
      const close = () => {
        if (closed) return;
        closed = true;
        try { controller?.close(); } catch { /* stream may already be terminal */ }
      };
      const fail = (reason: unknown) => {
        if (closed) return;
        closed = true;
        const error = reason instanceof Error ? reason : new Error(String(reason));
        try { controller?.error(error); } catch { /* stream may already be terminal */ }
        rejectText(error);
        cleanup();
        if (!settled) { settled = true; reject(error); }
      };
      const onAbort = () => { fail(abortError()); xhr.abort(); };
      signal?.addEventListener?.('abort', onAbort);
      const stream = new ReadableStream<Uint8Array>({
        start(nextController) { controller = nextController; },
        cancel() { closed = true; xhr.abort(); rejectText(abortError()); cleanup(); },
      });
      const flush = () => {
        if (closed || !controller || xhr.responseText.length <= lastIndex) return;
        const chunk = xhr.responseText.slice(lastIndex);
        lastIndex = xhr.responseText.length;
        controller.enqueue(encoder.encode(chunk));
      };
      xhr.onprogress = () => setTimeout(() => { try { flush(); } catch (error) { fail(error); xhr.abort(); } }, 0);
      xhr.onload = () => setTimeout(() => {
        try { flush(); } catch (error) { fail(error); return; }
        close(); cleanup(); resolveText(xhr.responseText);
      }, 0);
      xhr.onerror = () => setTimeout(() => fail(new TypeError('Network request failed')), 0);
      xhr.ontimeout = () => setTimeout(() => fail(new TypeError('Network request timed out')), 0);
      xhr.onreadystatechange = () => {
        const readyState = xhr.readyState;
        const status = xhr.status;
        if (readyState >= 2 && !response && status !== 0) {
          response = {
            ok: status >= 200 && status < 300,
            status,
            statusText: xhr.statusText,
            url,
            type: 'basic',
            redirected: false,
            headers: new Headers(),
            body: stream,
            get bodyUsed() { return false; },
            text: async () => fullText,
            json: async () => JSON.parse(await fullText),
            arrayBuffer: async () => encoder.encode(await fullText).buffer,
            blob: async () => new Blob([encoder.encode(await fullText)]),
            clone: () => { throw new Error('Response.clone() is not supported'); },
          };
          settled = true;
          resolve(response as Response);
        }
      };
      xhr.send(body);
    });
  };
  (streamingFetch as any).__originalFetch = originalFetch;
  globalThis.fetch = streamingFetch as typeof fetch;
}

// esbuild's package bundle imports the minified export under the name `t`.
export const t = installStreamingFetch;
