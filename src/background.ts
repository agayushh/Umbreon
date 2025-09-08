console.log("Background script loaded");

chrome.runtime.onMessage.addListener((msg, _send, _sendResponse) => {
  if (msg.action === "fillForm") {
    console.log("Filling form...");
  }
});
