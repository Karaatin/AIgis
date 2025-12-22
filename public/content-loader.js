(async () => {
  const src = chrome.runtime.getURL('src/content.js');
  await import(src);
})();