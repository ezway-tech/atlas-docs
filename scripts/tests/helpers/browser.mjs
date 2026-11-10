// Shared by Playwright configs and standalone browser tests.
const selected = process.env.ATLAS_TEST_BROWSER ?? 'chromium';
if (!['chromium', 'msedge', 'chrome'].includes(selected)) {
  throw new Error(`Invalid ATLAS_TEST_BROWSER: ${selected}. Use chromium, msedge, or chrome.`);
}
export const browserOptions = {
  headless: true,
  ...(selected === 'chromium' ? {} : {channel: selected}),
};
