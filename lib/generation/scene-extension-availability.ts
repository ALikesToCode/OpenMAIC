export interface SceneExtensionAvailabilityOptions {
  hasGenerateMoreScenesHandler: boolean;
  hasGenerationContext: boolean;
  isPendingScene: boolean;
  currentSceneIndex: number;
  sceneCount: number;
  hasNextPending: boolean;
}

export function canExtendClassroom({
  hasGenerateMoreScenesHandler,
  hasGenerationContext,
  isPendingScene,
  currentSceneIndex,
  sceneCount,
  hasNextPending,
}: SceneExtensionAvailabilityOptions): boolean {
  return (
    hasGenerateMoreScenesHandler &&
    hasGenerationContext &&
    !isPendingScene &&
    sceneCount > 0 &&
    currentSceneIndex === sceneCount - 1 &&
    !hasNextPending
  );
}
