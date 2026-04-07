import type { SceneOutline } from '@/lib/types/generation';

interface StreamSceneOutlinesParams {
  body: Record<string, unknown>;
  headers?: HeadersInit;
  signal?: AbortSignal;
  onOutline?: (outline: SceneOutline, allOutlines: SceneOutline[]) => void;
  onRetry?: () => void;
  fallbackErrorMessage: string;
}

export async function streamSceneOutlines({
  body,
  headers,
  signal,
  onOutline,
  onRetry,
  fallbackErrorMessage,
}: StreamSceneOutlinesParams): Promise<SceneOutline[]> {
  const response = await fetch('/api/generate/scene-outlines-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: fallbackErrorMessage }));
    throw new Error(data.error || fallbackErrorMessage);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Outline stream is not readable');
  }

  const decoder = new TextDecoder();
  const collected: SceneOutline[] = [];
  let sseBuffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (value) {
      sseBuffer += decoder.decode(value, { stream: !done });
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const event = JSON.parse(line.slice(6)) as
          | { type: 'outline'; data: SceneOutline }
          | { type: 'retry' }
          | { type: 'done'; outlines?: SceneOutline[] }
          | { type: 'error'; error?: string };

        if (event.type === 'outline') {
          collected.push(event.data);
          onOutline?.(event.data, [...collected]);
        } else if (event.type === 'retry') {
          collected.length = 0;
          onRetry?.();
        } else if (event.type === 'done') {
          return event.outlines || collected;
        } else if (event.type === 'error') {
          throw new Error(event.error || fallbackErrorMessage);
        }
      }
    }

    if (done) {
      if (collected.length > 0) {
        return collected;
      }

      throw new Error(fallbackErrorMessage);
    }
  }
}
