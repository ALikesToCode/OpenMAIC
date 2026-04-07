export function formatAdditionalScenesGeneratedMessage(count: number): string {
  return `Generated ${count} more scene${count === 1 ? '' : 's'}`;
}
