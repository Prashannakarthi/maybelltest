// Minimal hand-picked icon set (stroke-based, 24x24 viewBox), no external icon font needed.
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c1.4-4 5-5.5 7.5-5.5S18.1 16 19.5 20"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  rupee: '<path d="M6 4h12M6 9h12M6 4c4 0 6.5 1.8 6.5 5S16 14 6 14M6 14h4l7 6"/>',
  box: '<path d="M3.5 7.5L12 3l8.5 4.5L12 12 3.5 7.5z"/><path d="M3.5 7.5V16.5L12 21l8.5-4.5V7.5"/><path d="M12 12v9"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.2"/>',
  chat: '<path d="M4 5h16v11H8l-4 4V5z"/>',
  chart: '<path d="M4 20V10M11 20V4M18 20v-7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.2-1.6l2-1.5-2-3.4-2.3.9a7 7 0 00-2.8-1.6L13.3 2h-2.6l-.4 2.8a7 7 0 00-2.8 1.6l-2.3-.9-2 3.4 2 1.5A7 7 0 005 12a7 7 0 00.2 1.6l-2 1.5 2 3.4 2.3-.9a7 7 0 002.8 1.6l.4 2.8h2.6l.4-2.8a7 7 0 002.8-1.6l2.3.9 2-3.4-2-1.5c.1-.5.2-1 .2-1.6z"/>',
  dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  edit: '<path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 20V9M7 13l5-5 5 5M4 4h16"/>',
  close: '<path d="M5 5l14 14M19 5L5 19"/>',
  file: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/>',
  filter: '<path d="M4 5h16l-6 8v6l-4 2v-8z"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none"/>',
};

export function icon(name, cls = "") {
  const path = ICONS[name] || ICONS.grid;
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" class="${cls}" style="display:block;flex-shrink:0;min-width:16px;min-height:16px">${path}</svg>`;
}

export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-ic]").forEach((n) => {
    const name = n.getAttribute("data-ic");
    n.outerHTML = icon(name, n.className || "");
  });
}
