import type { SceneOutline } from '@/lib/types/generation';

interface SceneCountSignalInput {
  requirement?: string;
  pdfTextLength?: number;
  pdfPageCount?: number;
  researchContextLength?: number;
}

export interface SceneCountGuidanceInput extends SceneCountSignalInput {
  sceneCountTarget?: number;
  existingSceneCount?: number;
  additionalSceneCountTarget?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function inferAutomaticSceneCountTarget(input: SceneCountSignalInput): number {
  const requirementLength = input.requirement?.trim().length ?? 0;
  const pdfTextLength = input.pdfTextLength ?? 0;
  const pdfPageCount = input.pdfPageCount ?? 0;
  const researchContextLength = input.researchContextLength ?? 0;

  const pagePressure = pdfPageCount > 0 ? Math.ceil(pdfPageCount / 6) + 4 : 0;
  const textPressure = pdfTextLength > 0 ? Math.ceil(pdfTextLength / 9000) + 8 : 0;
  const requirementPressure =
    requirementLength > 1200 ? 18 : requirementLength > 600 ? 14 : requirementLength > 240 ? 10 : 8;
  const researchPressure =
    researchContextLength > 12000 ? 4 : researchContextLength > 4000 ? 2 : researchContextLength > 0 ? 1 : 0;

  return clamp(
    Math.max(12, pagePressure, textPressure, requirementPressure + researchPressure),
    12,
    72,
  );
}

export function inferAutomaticExtensionSceneTarget(input: SceneCountSignalInput & { existingSceneCount?: number }): number {
  const automaticTarget = inferAutomaticSceneCountTarget(input);
  const existingSceneCount = input.existingSceneCount ?? 0;
  const remainingNeed = automaticTarget - existingSceneCount;

  if (remainingNeed > 0) {
    return clamp(remainingNeed, 4, 24);
  }

  return clamp(Math.ceil(Math.max(existingSceneCount, 12) * 0.35), 4, 18);
}

export function buildSceneCountGuidance(input: SceneCountGuidanceInput): string {
  const automaticTarget = inferAutomaticSceneCountTarget(input);

  if ((input.existingSceneCount ?? 0) > 0) {
    const additionalTarget =
      input.additionalSceneCountTarget ?? inferAutomaticExtensionSceneTarget(input);

    return [
      `This course already has ${input.existingSceneCount} scenes.`,
      `Generate only new continuation scenes, not a full restart.`,
      `Append about ${additionalTarget} additional scenes after the current course ending.`,
      `Do not repeat topics that existing scenes already cover unless a deeper follow-up is necessary.`,
      `If the source material is still dense after those new scenes, prefer depth over compression.`,
    ].join(' ');
  }

  if (input.sceneCountTarget) {
    return [
      `Target about ${input.sceneCountTarget} scenes for the full course.`,
      `Do not compress dense source material into a short lecture if that would reduce coverage quality.`,
      `You may exceed the target slightly when needed to preserve logical coverage and pacing.`,
    ].join(' ');
  }

  return [
    `The source material appears dense enough to justify about ${automaticTarget} scenes.`,
    `Prefer a fuller syllabus map over a compressed short lecture when the PDF or notes are long.`,
    `If coverage quality requires more scenes, slightly exceed the target instead of omitting important modules.`,
  ].join(' ');
}

export function formatExistingOutlinesForPrompt(
  outlines: SceneOutline[] | undefined,
  maxChars = 4000,
): string {
  if (!outlines || outlines.length === 0) {
    return 'None';
  }

  const lines: string[] = [];
  let usedChars = 0;

  for (const outline of outlines) {
    const line = `${outline.order}. [${outline.type}] ${outline.title} — ${outline.description}`;
    if (usedChars + line.length > maxChars) {
      break;
    }
    lines.push(line);
    usedChars += line.length + 1;
  }

  return lines.length > 0 ? lines.join('\n') : 'None';
}
