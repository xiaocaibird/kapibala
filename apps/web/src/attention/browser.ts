export function pageHasAttention(): boolean {
  return document.visibilityState === "visible" && document.hasFocus();
}

/** Maximum space available to a row after it is scrolled into view. A timeline
 * may be much shorter than the browser window, so window height alone is unsafe. */
export function canFullyFitViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  let height = innerHeight;
  let width = innerWidth;
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent);
    const clip = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY))
      height = Math.min(height, clip.height);
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX))
      width = Math.min(width, clip.width);
  }
  return rect.height <= height + 2 && rect.width <= width + 2;
}

export function isPresented(element: HTMLElement | null | undefined): boolean {
  if (!element?.isConnected || !pageHasAttention()) return false;
  const modal = document.querySelector('[role="dialog"], dialog[open]');
  if (modal && !modal.contains(element)) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const visibleHeight =
    Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0);
  const visibleWidth =
    Math.min(rect.right, innerWidth) - Math.max(rect.left, 0);
  if (visibleHeight < rect.height - 2 || visibleWidth < rect.width - 2)
    return false;
  // Include clipping by the timeline's own scroll viewport, not just the window.
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent);
    if (!/(auto|scroll|hidden|clip)/.test(style.overflowY)) continue;
    const clip = parent.getBoundingClientRect();
    if (
      Math.min(rect.bottom, clip.bottom, innerHeight) -
        Math.max(rect.top, clip.top, 0) <
      rect.height - 2
    )
      return false;
  }
  return true;
}

let releaseBrowserAttention: (() => void) | null = null;

/** The active scope is the only owner of browser chrome. Original attributes
 * are restored on route/session cleanup, before a new scope takes ownership. */
export function ownBrowserAttention(title: string) {
  releaseBrowserAttention?.();
  const originalTitle = document.title;
  const icons = [
    ...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
  ];
  // Keep a real normal icon even if the embedding page did not supply one.
  // Removing a badge link alone can leave Chrome displaying its cached bitmap.
  if (icons.length === 0) {
    const fallback = document.createElement("link");
    fallback.rel = "icon";
    fallback.type = "image/svg+xml";
    fallback.href = "/favicon.svg";
    document.head.append(fallback);
    icons.push(fallback);
  }
  const icon = icons[icons.length - 1]!;
  const originalHref = icon.getAttribute("href");
  const originalType = icon.getAttribute("type");
  const originalMedia = icons.map((icon) => icon.getAttribute("media"));
  const badgeHref = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#243e55"/><path d="M8 7v18h4v-7l6 7h5l-8-10 7-8h-5l-5 6V7z" fill="white"/><circle cx="25" cy="7" r="7" fill="#e5484d" stroke="white" stroke-width="2"/></svg>')}`;
  let disposed = false;
  const restoreAttribute = (
    element: HTMLElement,
    name: string,
    value: string | null,
  ) => {
    if (element.getAttribute(name) === value) return;
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  };
  const setIcon = (pending: boolean) => {
    icons.forEach((candidate, index) => {
      if (pending && candidate !== icon) candidate.media = "not all";
      else restoreAttribute(candidate, "media", originalMedia[index] ?? null);
    });
    if (pending) {
      restoreAttribute(icon, "media", null);
      restoreAttribute(icon, "type", "image/svg+xml");
      restoreAttribute(icon, "href", badgeHref);
    } else {
      restoreAttribute(icon, "type", originalType);
      restoreAttribute(icon, "href", originalHref);
    }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    document.title = originalTitle;
    setIcon(false);
    releaseBrowserAttention = null;
  };
  releaseBrowserAttention = dispose;
  const update = (pending: boolean) => {
    if (disposed) return;
    document.title = `${pending ? "[有更新] " : ""}${title.endsWith("· Kapibala") ? title : `${title} · Kapibala`}`;
    setIcon(pending);
  };
  update(false);
  return {
    update,
    dispose,
  };
}
