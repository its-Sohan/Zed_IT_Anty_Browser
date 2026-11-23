try {
  var saved = localStorage.getItem('zita-color-scheme');
  var scheme = saved === 'light' || saved === 'dark' ? saved : 'light dark';
  var meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', scheme);
  var isDark =
    scheme === 'dark' ||
    (scheme === 'light dark' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
} catch (_err) {
  // Ignore storage access errors; <meta> remains "light dark".
}
