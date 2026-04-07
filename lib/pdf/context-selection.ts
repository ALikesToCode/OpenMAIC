const SOURCE_DOCUMENT_PREFIX = '[Source Document: ';
const DEFAULT_MAX_CONTEXT_CHARS = 16000;
const DEFAULT_TARGET_CHUNK_CHARS = 1200;
const DEFAULT_MAX_SELECTED_CHUNKS = 8;
const MIN_TOKEN_LENGTH = 3;
const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'because',
  'being',
  'between',
  'could',
  'explain',
  'find',
  'from',
  'have',
  'into',
  'more',
  'that',
  'their',
  'there',
  'these',
  'this',
  'those',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
]);

export type PdfContextRankingStrategy = 'keyword' | 'embedding';
export type PdfContextEmbeddingTask = 'query' | 'document';

export interface SelectedPdfContextChunk {
  sourceTitle: string;
  text: string;
  score: number;
  chunkIndex: number;
}

export interface SelectRelevantPdfContextResult {
  context: string;
  selectedChunks: SelectedPdfContextChunk[];
  strategy: PdfContextRankingStrategy;
  totalChunks: number;
}

export interface SelectRelevantPdfContextInput {
  requirement: string;
  pdfText: string;
  maxChars?: number;
  maxSelectedChunks?: number;
  embedder?: (
    items: string[],
    taskType: PdfContextEmbeddingTask,
    options?: { titles?: string[] },
  ) => Promise<number[][]>;
}

interface SourceSection {
  title: string;
  text: string;
}

interface RankedChunk extends SelectedPdfContextChunk {
  keywordScore: number;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeRequirement(requirement: string): string[] {
  return Array.from(
    new Set(
      normalizeSearchText(requirement)
        .split(' ')
        .map((token) => token.trim())
        .filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(token)),
    ),
  );
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const escapedNeedle = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = haystack.match(new RegExp(escapedNeedle, 'g'));
  return matches?.length ?? 0;
}

function splitSourceSections(pdfText: string): SourceSection[] {
  const lines = pdfText.split(/\r?\n/);
  const sections: SourceSection[] = [];
  let currentTitle = 'Document';
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) {
      sections.push({
        title: currentTitle,
        text,
      });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (line.startsWith(SOURCE_DOCUMENT_PREFIX) && line.endsWith(']')) {
      flush();
      currentTitle = line.slice(SOURCE_DOCUMENT_PREFIX.length, -1).trim() || 'Document';
      continue;
    }

    buffer.push(line);
  }

  flush();
  return sections.length > 0
    ? sections
    : [
        {
          title: 'Document',
          text: pdfText.trim(),
        },
      ];
}

function splitLongParagraph(text: string, targetChars: number): string[] {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= targetChars) {
    return [normalized];
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/);
  if (sentences.length > 1) {
    const chunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if (!current) {
        current = sentence;
        continue;
      }

      if (`${current} ${sentence}`.length > targetChars) {
        chunks.push(current);
        current = sentence;
      } else {
        current = `${current} ${sentence}`;
      }
    }

    if (current) {
      chunks.push(current);
    }

    return chunks;
  }

  const chunks: string[] = [];
  for (let offset = 0; offset < normalized.length; offset += targetChars) {
    chunks.push(normalized.slice(offset, offset + targetChars).trim());
  }
  return chunks.filter(Boolean);
}

function chunkSourceSection(section: SourceSection, targetChars: number): SourceSection[] {
  return section.text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph) => splitLongParagraph(paragraph, targetChars))
    .map((text) => ({
      title: section.title,
      text,
    }));
}

function buildKeywordRankedChunks(requirement: string, chunks: SourceSection[]): RankedChunk[] {
  const normalizedRequirement = normalizeSearchText(requirement);
  const tokens = tokenizeRequirement(requirement);

  return chunks.map((chunk, index) => {
    const normalizedText = normalizeSearchText(`${chunk.title} ${chunk.text}`);
    let score = normalizedRequirement && normalizedText.includes(normalizedRequirement) ? 12 : 0;

    for (const token of tokens) {
      const occurrences = countOccurrences(normalizedText, token);
      if (occurrences > 0) {
        score += Math.min(occurrences, 4) * 3;
      }

      if (normalizeSearchText(chunk.title).includes(token)) {
        score += 1;
      }
    }

    return {
      sourceTitle: chunk.title,
      text: chunk.text,
      score,
      keywordScore: score,
      chunkIndex: index,
    };
  });
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

async function buildEmbeddingRankedChunks(
  requirement: string,
  keywordRankedChunks: RankedChunk[],
  embedder: NonNullable<SelectRelevantPdfContextInput['embedder']>,
): Promise<RankedChunk[]> {
  const queryEmbeddings = await embedder([requirement], 'query');
  const documentEmbeddings = await embedder(
    keywordRankedChunks.map((chunk) => chunk.text),
    'document',
    {
      titles: keywordRankedChunks.map((chunk) => chunk.sourceTitle),
    },
  );

  const queryEmbedding = queryEmbeddings[0];
  if (!queryEmbedding || documentEmbeddings.length !== keywordRankedChunks.length) {
    throw new Error('Embedding provider returned an unexpected number of vectors');
  }

  return keywordRankedChunks.map((chunk, index) => ({
    ...chunk,
    score: cosineSimilarity(queryEmbedding, documentEmbeddings[index]) + chunk.keywordScore * 0.01,
  }));
}

function buildContextString(chunks: SelectedPdfContextChunk[], maxChars: number): string {
  let context = '';
  let previousTitle: string | null = null;

  for (const chunk of chunks) {
    const prefix =
      previousTitle === chunk.sourceTitle
        ? '\n\n'
        : `${context ? '\n\n' : ''}[Source Document: ${chunk.sourceTitle}]\n`;
    const remaining = maxChars - context.length - prefix.length;
    if (remaining <= 0) {
      break;
    }

    const text = chunk.text.length > remaining ? chunk.text.slice(0, remaining).trimEnd() : chunk.text;
    if (!text) {
      continue;
    }

    context += `${prefix}${text}`;
    previousTitle = chunk.sourceTitle;
  }

  return context.trim();
}

export async function selectRelevantPdfContext({
  requirement,
  pdfText,
  maxChars = DEFAULT_MAX_CONTEXT_CHARS,
  maxSelectedChunks = DEFAULT_MAX_SELECTED_CHUNKS,
  embedder,
}: SelectRelevantPdfContextInput): Promise<SelectRelevantPdfContextResult> {
  const trimmedPdfText = pdfText.trim();
  if (!trimmedPdfText) {
    return {
      context: '',
      selectedChunks: [],
      strategy: 'keyword',
      totalChunks: 0,
    };
  }

  const sections = splitSourceSections(trimmedPdfText);
  const chunkedSections = sections.flatMap((section) =>
    chunkSourceSection(section, DEFAULT_TARGET_CHUNK_CHARS),
  );
  const keywordRankedChunks = buildKeywordRankedChunks(requirement, chunkedSections);

  let rankedChunks = keywordRankedChunks;
  let strategy: PdfContextRankingStrategy = 'keyword';

  if (embedder) {
    try {
      rankedChunks = await buildEmbeddingRankedChunks(requirement, keywordRankedChunks, embedder);
      strategy = 'embedding';
    } catch {
      rankedChunks = keywordRankedChunks;
    }
  }

  const rankedCandidates = rankedChunks.filter((chunk) => chunk.score > 0);
  const bestScore =
    rankedCandidates.reduce((best, chunk) => Math.max(best, chunk.score), 0) || 0;
  const relevanceThreshold = bestScore > 0 ? bestScore * 0.35 : 0;
  const topRankedChunks = (rankedCandidates.length > 0 ? rankedCandidates : rankedChunks.slice())
    .filter((chunk) => rankedCandidates.length === 0 || chunk.score >= relevanceThreshold)
    .sort((left, right) => right.score - left.score || left.chunkIndex - right.chunkIndex)
    .slice(0, maxSelectedChunks)
    .sort((left, right) => left.chunkIndex - right.chunkIndex)
    .map((chunk) => ({
      sourceTitle: chunk.sourceTitle,
      text: chunk.text,
      score: chunk.score,
      chunkIndex: chunk.chunkIndex,
    }));

  const context =
    buildContextString(topRankedChunks, maxChars) || trimmedPdfText.slice(0, maxChars).trim();

  return {
    context,
    selectedChunks: topRankedChunks,
    strategy,
    totalChunks: chunkedSections.length,
  };
}
