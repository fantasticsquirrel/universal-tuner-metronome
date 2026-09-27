import { deactivateKeepAwake } from 'expo-keep-awake';

const KEEP_AWAKE_TAG_INACTIVE_ERROR = 'ERR_KEEP_AWAKE_TAG_INVALID';

function isInactiveKeepAwakeTagError(error: unknown): boolean {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === KEEP_AWAKE_TAG_INACTIVE_ERROR
  );
}

/** Releases a wake lock while allowing repeated cleanup for the same tag. */
export async function deactivateKeepAwakeIfActive(tag: string): Promise<void> {
  try {
    await deactivateKeepAwake(tag);
  } catch (error) {
    if (isInactiveKeepAwakeTagError(error)) return;
    throw error;
  }
}
