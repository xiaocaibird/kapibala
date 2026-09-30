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

let titleOwner: symbol | null = null;

/** The active scope is the only owner of browser chrome. Original attributes
 * are restored on route/session cleanup; no network favicon or permission UI. */
export function ownBrowserAttention(title: string) {
  const owner = Symbol(title);
  titleOwner = owner;
  const originalTitle = document.title;
  const icons = [
    ...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
  ];
  const originalMedia = icons.map((icon) => icon.getAttribute("media"));
  const badge = document.createElement("link");
  badge.rel = "icon";
  badge.type = "image/svg+xml";
  badge.href = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#243e55"/><path d="M8 7v18h4v-7l6 7h5l-8-10 7-8h-5l-5 6V7z" fill="white"/><circle cx="25" cy="7" r="7" fill="#e5484d" stroke="white" stroke-width="2"/></svg>')}`;
  const update = (pending: boolean) => {
    if (titleOwner !== owner) return;
    document.title = `${pending ? "[有更新] " : ""}${title.endsWith("· Kapibala") ? title : `${title} · Kapibala`}`;
    icons.forEach((icon, index) => {
      if (pending) icon.media = "not all";
      else if (originalMedia[index] === null) icon.removeAttribute("media");
      else icon.setAttribute("media", originalMedia[index] ?? "");
    });
    if (pending && !badge.isConnected) document.head.append(badge);
    if (!pending) badge.remove();
  };
  update(false);
  return {
    update,
    dispose() {
      badge.remove();
      if (titleOwner !== owner) return;
      titleOwner = null;
      document.title = originalTitle;
      icons.forEach((icon, index) => {
        if (originalMedia[index] === null) icon.removeAttribute("media");
        else icon.setAttribute("media", originalMedia[index] ?? "");
      });
    },
  };
}
