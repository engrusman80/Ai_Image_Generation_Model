// Shared by the server layout and the browser settings code (so: no React imports here).
export const SETTINGS_KEY = "imagestudio.settings";

/** Runs before the page paints (in layout.tsx), so there is no white flash in dark mode. */
export const THEME_BOOT_SCRIPT = `try{var t=(JSON.parse(localStorage.getItem('${SETTINGS_KEY}')||'{}').theme)||'system';document.documentElement.classList.toggle('dark',t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches))}catch(e){}`;
