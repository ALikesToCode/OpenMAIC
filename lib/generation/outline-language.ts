import type { SceneOutline } from '@/lib/types/generation';

const CJK_REGEX = /[\u3400-\u9fff\uf900-\ufaff]/;
const LATIN_REGEX = /[A-Za-z]/;

export type SceneLanguage = 'zh-CN' | 'en-US';

function inferLanguageFromText(text: string): SceneLanguage {
  const hasCjk = CJK_REGEX.test(text);
  const hasLatin = LATIN_REGEX.test(text);

  if (hasCjk && !hasLatin) return 'zh-CN';
  if (hasLatin && !hasCjk) return 'en-US';
  if (hasCjk) return 'zh-CN';
  return 'en-US';
}

export function resolveOutlineLanguage(
  outline: SceneOutline,
  fallbackLanguage?: SceneLanguage,
): SceneLanguage {
  if (outline.language) return outline.language;

  if (fallbackLanguage) return fallbackLanguage;

  const pblLanguage = outline.pblConfig?.language;
  if (pblLanguage) return pblLanguage;

  const text = [outline.title, outline.description, ...(outline.keyPoints || [])]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n');

  return inferLanguageFromText(text);
}

export function normalizeOutlineLanguage(
  outline: SceneOutline,
  fallbackLanguage?: SceneLanguage,
): SceneOutline {
  const language = resolveOutlineLanguage(outline, fallbackLanguage);

  return {
    ...outline,
    language,
    pblConfig: outline.pblConfig
      ? {
          ...outline.pblConfig,
          language,
        }
      : undefined,
  };
}
