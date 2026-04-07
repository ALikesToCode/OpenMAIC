/**
 * Prompt Loader - Loads prompts from markdown files
 *
 * Supports:
 * - Loading prompts from bundled templates/{promptId}/ content
 * - Snippet inclusion via {{snippet:name}} syntax
 * - Variable interpolation via {{variable}} syntax
 * - Caching for performance
 */

import type { PromptId, LoadedPrompt, SnippetId } from './types';
import { createLogger } from '@/lib/logger';
const log = createLogger('PromptLoader');

// Cache for loaded prompts and snippets
const promptCache = new Map<string, LoadedPrompt>();
const snippetCache = new Map<string, string>();
const templateModules = import.meta.glob('./templates/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const snippetModules = import.meta.glob('./snippets/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function getBundledSnippet(snippetId: SnippetId): string | null {
  return snippetModules[`./snippets/${snippetId}.md`] ?? null;
}

function getBundledTemplate(promptId: PromptId, part: 'system' | 'user'): string | null {
  return templateModules[`./templates/${promptId}/${part}.md`] ?? null;
}

/**
 * Load a snippet by ID
 */
export function loadSnippet(snippetId: SnippetId): string {
  const cached = snippetCache.get(snippetId);
  if (cached) return cached;
  const content = getBundledSnippet(snippetId)?.trim();
  if (content) {
    snippetCache.set(snippetId, content);
    return content;
  }

  log.warn(`Snippet not found: ${snippetId}`);
  return `{{snippet:${snippetId}}}`;
}

/**
 * Process snippet includes in a template
 * Replaces {{snippet:name}} with actual snippet content
 */
function processSnippets(template: string): string {
  return template.replace(/\{\{snippet:(\w[\w-]*)\}\}/g, (_, snippetId) => {
    return loadSnippet(snippetId as SnippetId);
  });
}

/**
 * Load a prompt by ID
 */
export function loadPrompt(promptId: PromptId): LoadedPrompt | null {
  const cached = promptCache.get(promptId);
  if (cached) return cached;
  const systemSource = getBundledTemplate(promptId, 'system');
  if (!systemSource) {
    log.error(`Failed to load prompt ${promptId}: missing system.md`);
    return null;
  }

  const userSource = getBundledTemplate(promptId, 'user') ?? '';
  const loaded: LoadedPrompt = {
    id: promptId,
    systemPrompt: processSnippets(systemSource.trim()),
    userPromptTemplate: processSnippets(userSource.trim()),
  };

  promptCache.set(promptId, loaded);
  return loaded;
}

/**
 * Interpolate variables in a template
 * Replaces {{variable}} with values from the variables object
 */
export function interpolateVariables(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === undefined) return match;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  });
}

/**
 * Build a complete prompt with variables
 */
export function buildPrompt(
  promptId: PromptId,
  variables: Record<string, unknown>,
): { system: string; user: string } | null {
  const prompt = loadPrompt(promptId);
  if (!prompt) return null;

  return {
    system: interpolateVariables(prompt.systemPrompt, variables),
    user: interpolateVariables(prompt.userPromptTemplate, variables),
  };
}

/**
 * Clear all caches (useful for development/testing)
 */
export function clearPromptCache(): void {
  promptCache.clear();
  snippetCache.clear();
}
