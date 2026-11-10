// Apply the saved appearance before the application/styles paint.
(() => {
  let preference = 'system';
  try {
    const saved = localStorage.getItem('writing-award:theme:v1');
    if (saved === 'light' || saved === 'dark' || saved === 'system') preference = saved;
  } catch { /* Appearance still follows the device when storage is unavailable. */ }
  const theme = preference === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#211e24' : '#fff9f2');
})();
