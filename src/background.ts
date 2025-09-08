console.log("Background script loaded");

chrome.runtime.onMessage.addListener((msg, send, sendResponse) => {
  if (msg.action === "fillForm") {
    console.log("Filling form...");
  }
});
