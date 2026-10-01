import type { Page } from '@playwright/test';
import { BlockedError } from '../../harness/security.js';

type FocusEvidence = {
  kind: 'native-tab-focus';
  at: string;
  browser: string;
  overrideRemoved: boolean;
  observationBudgetMs: number;
  stages: {
    stage: string;
    foreground: { hasFocus: boolean; visibility: string };
    background?: { hasFocus: boolean; visibility: string };
  }[];
  error?: string;
};
type Options = { record?: (evidence: FocusEvidence) => void | Promise<void> };

/** Remove Playwright's Chromium always-focused override; never synthesize page events. */
async function removeFocusOverride(page: Page): Promise<boolean> {
  if (page.context().browser()?.browserType().name() !== 'chromium') return false;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  } finally {
    await session.detach();
  }
  return true;
}

async function state(page: Page): Promise<{ hasFocus: boolean; visibility: string }> {
  return page.evaluate(() => ({
    hasFocus: document.hasFocus(),
    visibility: document.visibilityState,
  }));
}

/** A tool precondition budget, not a product response-time requirement. */
async function exclusiveFocus(front: Page, back?: Page): Promise<void> {
  const end = performance.now() + 2000;
  do {
    if ((await state(front)).hasFocus && (!back || !(await state(back)).hasFocus)) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  } while (performance.now() < end);
  throw new BlockedError(
    '浏览器未建立真实排他标签焦点；已移除适用的工具焦点仿真，不伪造visibility/focus事件',
  );
}

export async function nativeBackgroundTab(page: Page, options: Options = {}): Promise<Page> {
  const evidence: FocusEvidence = {
    kind: 'native-tab-focus',
    at: new Date().toISOString(),
    browser: page.context().browser()?.browserType().name() ?? 'unknown',
    overrideRemoved: false,
    observationBudgetMs: 2000,
    stages: [],
  };
  let other: Page | undefined;
  try {
    evidence.overrideRemoved = await removeFocusOverride(page);
    other = await page.context().newPage();
    await other.goto('about:blank');
    await removeFocusOverride(other);
    // Establish a genuine focused origin, then a real browser tab switch.
    await page.bringToFront();
    await exclusiveFocus(page, other);
    evidence.stages.push({
      stage: 'original-front',
      foreground: await state(page),
      background: await state(other),
    });
    await other.bringToFront();
    await exclusiveFocus(other, page);
    evidence.stages.push({
      stage: 'other-front',
      foreground: await state(other),
      background: await state(page),
    });
    await options.record?.(evidence);
    return other;
  } catch (error) {
    evidence.error = String(error);
    try {
      await options.record?.(evidence);
    } catch (recordError) {
      console.error('native focus evidence failed (original failure retained)', recordError);
    }
    try {
      await other?.close();
    } catch (closeError) {
      console.error('native focus tab cleanup failed (original failure retained)', closeError);
    }
    if (error instanceof BlockedError) throw error;
    throw new BlockedError(`真实标签焦点接入失败：${String(error)}`);
  }
}
