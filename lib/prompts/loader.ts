/**
 * Prompt Loader - Loads prompts from bundled markdown files.
 *
 * Supports:
 * - Loading prompts from bundled templates/{promptId}/ content
 * - Snippet inclusion via {{snippet:name}} syntax
 * - Conditional blocks via {{#if condition}}...{{/if}} syntax
 * - Variable interpolation via {{variable}} syntax
 */
/// <reference types="vite/client" />

import type { PromptId, LoadedPrompt, SnippetId } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('PromptLoader');

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
 * Load a snippet by ID.
 */
export function loadSnippet(snippetId: SnippetId): string {
  const cached = snippetCache.get(snippetId);
  if (cached) return cached;

  const content = getBundledSnippet(snippetId)?.trim();
  if (!content) {
    throw new Error(`Snippet not found: ${snippetId}`);
  }

  snippetCache.set(snippetId, content);
  return content;
}

/**
 * Process snippet includes in a template.
 * Replaces {{snippet:name}} with actual snippet content.
 */
export function processSnippets(template: string): string {
  return template.replace(/\{\{snippet:(\w[\w-]*)\}\}/g, (_, snippetId) => {
    return loadSnippet(snippetId as SnippetId);
  });
}

/**
 * Process conditional blocks in a template.
 * Replaces {{#if conditionName}}...{{/if}} with the inner content when the
 * named condition is truthy, or removes the entire block when it is falsy.
 */
export function processConditionalBlocks(
  template: string,
  conditions: Record<string, unknown>,
): string {
  return template.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, conditionName: string, content: string) => {
      return conditions[conditionName] ? content : '';
    },
  );
}

/**
 * Load a prompt by ID.
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
 * Interpolate variables in a template.
 * Replaces {{variable}} with values from the variables object.
 */
export function interpolateVariables(template: string, variables: Record<string, unknown>): string {
  // `\w+` only matches [A-Za-z0-9_], so kebab-case placeholders like
  // `{{next-agent}}` pass through unchanged. Convention is camelCase.
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === undefined) return match;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  });
}

/**
 * Build a complete prompt with variables.
 */
export function buildPrompt(
  promptId: PromptId,
  variables: Record<string, unknown>,
): { system: string; user: string } | null {
  const prompt = loadPrompt(promptId);
  if (!prompt) return null;

  return {
    system: interpolateVariables(
      processConditionalBlocks(prompt.systemPrompt, variables),
      variables,
    ),
    user: interpolateVariables(
      processConditionalBlocks(prompt.userPromptTemplate, variables),
      variables,
    ),
  };
}

export function clearPromptCache(): void {
  promptCache.clear();
  snippetCache.clear();
}
