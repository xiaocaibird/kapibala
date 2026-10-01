import type { Locator } from '@playwright/test';
import { BlockedError } from '../../harness/security.js';

export interface PublicActionPremise {
  count: number;
  visible: boolean | null;
  enabled: boolean | null;
}
/** Read-only admission check. It never clicks, forces a disabled control, or treats
 * a missing/ambiguous public entry as an observed product assertion failure. */
export async function requireAvailablePublicAction(
  locator: Pick<Locator, 'count' | 'isVisible' | 'isEnabled'>,
  reason: string,
  observe: (sample: PublicActionPremise) => void,
): Promise<void> {
  const count = await locator.count();
  const sample: PublicActionPremise = {
    count,
    visible: count === 1 ? await locator.isVisible() : null,
    enabled: count === 1 ? await locator.isEnabled() : null,
  };
  observe(sample);
  if (count !== 1 || !sample.visible || !sample.enabled)
    throw new BlockedError(
      `${reason}（匹配${count}，可见${sample.visible}，可用${sample.enabled}）`,
    );
}
