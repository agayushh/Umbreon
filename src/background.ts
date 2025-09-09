console.log("AI Form Filler background script loaded");

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === "clearCache") {
    // Forward the message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "clearCache" });
      }
    });
    sendResponse({ success: true });
  }
});
