import { useState, useEffect } from 'react';

interface FormStats {
  count: number;
  fields: Array<{
    type: string;
    name: string;
    label: string;
    placeholder: string;
    required: boolean;
  }>;
}

interface SuggestedUpdate {
  key: string;
  label: string;
  value: string;
}

export default function Popup() {
  const [apiKey, setApiKey] = useState('');
  const [isApiKeySet, setIsApiKeySet] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [formStats, setFormStats] = useState<FormStats>({ count: 0, fields: [] });
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [suggested, setSuggested] = useState<SuggestedUpdate[]>([]);
  const [sensitive, setSensitive] = useState<string[]>([]);
  const [mode, setMode] = useState<'auto'|'conservative'|'off'>('conservative');

  useEffect(() => {
    const initializePopup = async () => {
      try {
        // Check if API key is already set
        const result = await chrome.storage.sync.get(['openaiApiKey']);
        if (result.openaiApiKey) {
          setIsApiKeySet(true);
          setApiKey(result.openaiApiKey);
        }
        const pref = await chrome.storage.sync.get(['usageMode']);
        if (pref.usageMode) setMode(pref.usageMode);

        // Detect forms on current page
        await detectForms();
      } catch (error) {
        console.error('Error initializing popup:', error);
      }
    };

    initializePopup();
  }, []);

  const detectForms = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log('Current tab:', tab);
      
      if (tab.id) {
        console.log('Sending detectForms message to tab:', tab.id);
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'detectForms' });
        console.log('Form detection response:', response);
        setFormStats(response || { count: 0, fields: [] });
      } else {
        console.log('No active tab found');
        setFormStats({ count: 0, fields: [] });
      }
    } catch (error) {
      console.error('Error detecting forms:', error);
      setFormStats({ count: 0, fields: [] });
    }
  };

  const saveApiKey = async () => {
    if (!apiKey.trim()) {
      setMessage('Please enter a valid API key');
      return;
    }

    try {
      await chrome.storage.sync.set({ openaiApiKey: apiKey.trim() });
      setIsApiKeySet(true);
      setShowApiKeyInput(false);
      setMessage('API key saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Failed to save API key');
      console.error('Error saving API key:', error);
    }
  };

  const fillForm = async () => {
    if (!isApiKeySet) {
      setMessage('Please set your OpenAI API key first');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'fillForm' });
        
        if (response.success) {
          setMessage(`✅ ${response.message}`);
          if (response.stats?.errors?.length > 0) {
            setMessage(prev => prev + ` (${response.stats.errors.length} errors)`);
          }
          if (response.stats?.suggestedProfileUpdates) {
            setSuggested(response.stats.suggestedProfileUpdates as SuggestedUpdate[]);
          } else {
            setSuggested([]);
          }
        } else {
          setMessage(`❌ ${response.message}`);
        }
      }
    } catch (error) {
      setMessage('❌ Error: Could not communicate with the page');
      console.error('Error filling form:', error);
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const saveLearned = async () => {
    if (suggested.length === 0) return;
    const data: Record<string, string> = {};
    suggested.forEach(s => {
      if (!sensitive.includes(s.key)) data[s.key] = s.value;
    });
    await chrome.storage.sync.set({ userData: { ...(await chrome.storage.sync.get(['userData'])).userData, ...data } });
    // Save sensitive preferences
    await chrome.storage.sync.set({ sensitiveKeys: sensitive });
    setMessage('Saved new profile data');
    setTimeout(() => setMessage(''), 3000);
    setSuggested([]);
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const changeMode = async (newMode: 'auto'|'conservative'|'off') => {
    setMode(newMode);
    await chrome.storage.sync.set({ usageMode: newMode });
  };

  return (
    <div className="p-4 w-80 bg-gray-50 min-h-[400px]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-gray-800">AI Form Filler</h1>
        <button
          onClick={openOptions}
          className="text-gray-500 hover:text-gray-700 text-sm"
          title="Open settings"
        >
          ⚙️
        </button>
      </div>

      {/* API Key Section */}
      <div className="mb-4">
        {!isApiKeySet ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">Set your OpenAI API key to start:</p>
            {!showApiKeyInput ? (
              <button
                onClick={() => setShowApiKeyInput(true)}
                className="w-full bg-green-500 text-white p-2 rounded text-sm hover:bg-green-600"
              >
                Set API Key
              </button>
            ) : (
              <div className="space-y-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full p-2 border border-gray-300 rounded text-sm"
                />
                <div className="flex space-x-2">
                  <button
                    onClick={saveApiKey}
                    className="flex-1 bg-green-500 text-white p-2 rounded text-sm hover:bg-green-600"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setShowApiKeyInput(false);
                      setApiKey('');
                    }}
                    className="flex-1 bg-gray-500 text-white p-2 rounded text-sm hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between bg-green-100 p-2 rounded">
            <span className="text-sm text-green-800">✅ API Key Set</span>
            <button
              onClick={() => {
                setIsApiKeySet(false);
                setApiKey('');
                chrome.storage.sync.remove(['openaiApiKey']);
              }}
              className="text-xs text-green-600 hover:text-green-800"
            >
              Change
            </button>
          </div>
        )}
      </div>

      {/* Form Detection */}
      <div className="mb-4 p-3 bg-blue-50 rounded">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-blue-800">
            Forms Detected: {formStats.count}
          </span>
          <button
            onClick={detectForms}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            🔄 Refresh
          </button>
        </div>
        <div className="mt-2 text-xs text-blue-700 flex items-center space-x-2">
          <span>AI usage:</span>
          <select
            value={mode}
            onChange={(e) => changeMode(e.target.value as any)}
            className="border rounded px-1 py-0.5 text-xs bg-white"
          >
            <option value="auto">Auto (one AI call)</option>
            <option value="conservative">Conservative (AI only if needed)</option>
            <option value="off">Off (dataset only)</option>
          </select>
        </div>
        {formStats.count > 0 && (
          <div className="mt-2 text-xs text-blue-600">
            {formStats.fields.slice(0, 3).map((field, index) => (
              <div key={index} className="truncate">
                {field.label || field.placeholder || field.name || 'Unnamed field'}
              </div>
            ))}
            {formStats.fields.length > 3 && (
              <div>... and {formStats.fields.length - 3} more</div>
            )}
          </div>
        )}
      </div>

      {/* Fill Form Button */}
      <button
        onClick={fillForm}
        disabled={!isApiKeySet || isLoading || formStats.count === 0}
        className={`w-full p-3 rounded font-medium ${
          !isApiKeySet || isLoading || formStats.count === 0
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-blue-500 text-white hover:bg-blue-600'
        }`}
      >
        {isLoading ? 'Filling...' : 'Fill Form with AI'}
      </button>

      {/* Status Message */}
      {message && (
        <div className={`mt-4 p-2 rounded text-sm ${
          message.includes('✅') 
            ? 'bg-green-100 text-green-800' 
            : message.includes('❌')
            ? 'bg-red-100 text-red-800'
            : 'bg-yellow-100 text-yellow-800'
        }`}>
          {message}
        </div>
      )}

      {/* Suggested profile updates */}
      {suggested.length > 0 && (
        <div className="mt-4 p-3 border rounded bg-white">
          <div className="text-sm font-medium text-gray-800 mb-2">Save new data to your profile?</div>
          <div className="space-y-2 max-h-40 overflow-auto">
            {suggested.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="truncate">
                  <span className="font-semibold">{s.key}:</span> {s.value}
                </div>
                <label className="ml-2 text-xs text-gray-600 flex items-center">
                  <input
                    type="checkbox"
                    checked={sensitive.includes(s.key)}
                    onChange={(e) => {
                      setSensitive(prev => e.target.checked ? [...prev, s.key] : prev.filter(k => k !== s.key));
                    }}
                    className="mr-1"
                  />
                  Sensitive (do not store)
                </label>
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-2 space-x-2">
            <button onClick={() => setSuggested([])} className="text-sm px-3 py-1 bg-gray-200 rounded">Dismiss</button>
            <button onClick={saveLearned} className="text-sm px-3 py-1 bg-blue-600 text-white rounded">Save</button>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="mt-4 text-xs text-gray-500 space-y-1">
        <div>💡 Tip: Set up your profile data in Settings for better results</div>
        <div>🔒 Your API key is stored securely in Chrome storage</div>
        <div>⚡ AI responses are cached to save API costs</div>
      </div>
    </div>
  );
}
