import { formFiller } from './formFiller';

console.log("AI Form Filler content script loaded");

// Listen for messages from popup or background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.action === 'fillForm') {
    console.log('Handling fillForm action');
    formFiller.fillForm().then(result => {
      console.log('Fill form result:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('Fill form error:', error);
      sendResponse({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
    });
    return true; // Keep message channel open for async response
  }
  
  if (message.action === 'detectForms') {
    console.log('Handling detectForms action');
    formFiller.detectForms().then(result => {
      console.log('Detect forms result:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('Detect forms error:', error);
      sendResponse({ count: 0, fields: [] });
    });
    return true;
  }

  if (message.action === 'clearCache') {
    console.log('Handling clearCache action');
    formFiller.clearCache();
    sendResponse({ success: true });
    return true;
  }
  
  console.log('Unknown action:', message.action);
});

// Initialize form filler when content script loads
console.log('Initializing form filler...');
formFiller.initialize().then(() => {
  console.log('Form filler initialized successfully');
}).catch(error => {
  console.error('Failed to initialize form filler:', error);
});
