import { useState, useEffect } from 'react';
import type { UserData } from './aiService';

export default function Options() {
  const [userData, setUserData] = useState<UserData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'cache' | 'settings'>('profile');

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const result = await chrome.storage.sync.get(['userData']);
      setUserData(result.userData || {});
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const saveUserData = async () => {
    setIsLoading(true);
    try {
      await chrome.storage.sync.set({ userData });
      setMessage('Profile data saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('Failed to save profile data');
      console.error('Error saving user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (field: keyof UserData, value: any) => {
    setUserData(prev => ({ ...prev, [field]: value }));
  };

  const addSkill = () => {
    const skill = prompt('Enter a skill:');
    if (skill && skill.trim()) {
      setUserData(prev => ({
        ...prev,
        skills: [...(prev.skills || []), skill.trim()]
      }));
    }
  };

  const removeSkill = (index: number) => {
    setUserData(prev => ({
      ...prev,
      skills: prev.skills?.filter((_, i) => i !== index) || []
    }));
  };

  const clearCache = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        await chrome.tabs.sendMessage(tab.id, { action: 'clearCache' });
        setMessage('Cache cleared successfully!');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      setMessage('Failed to clear cache');
      console.error('Error clearing cache:', error);
    }
  };

  const exportData = () => {
    const dataStr = JSON.stringify(userData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ai-form-filler-profile.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedData = JSON.parse(e.target?.result as string);
          setUserData(importedData);
          setMessage('Data imported successfully!');
          setTimeout(() => setMessage(''), 3000);
        } catch (error) {
          setMessage('Invalid file format');
          setTimeout(() => setMessage(''), 3000);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg">
          <div className="border-b border-gray-200">
            <div className="px-6 py-4">
              <h1 className="text-2xl font-bold text-gray-900">AI Form Filler Settings</h1>
              <p className="text-gray-600 mt-1">Manage your profile data and extension settings</p>
            </div>
            
            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              {[
                { id: 'profile', label: 'Profile Data', icon: '👤' },
                { id: 'cache', label: 'Cache & Performance', icon: '⚡' },
                { id: 'settings', label: 'Settings', icon: '⚙️' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* Profile Data Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={userData.name || ''}
                        onChange={(e) => updateField('name', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="John Doe"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={userData.email || ''}
                        onChange={(e) => updateField('email', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="john@example.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={userData.phone || ''}
                        onChange={(e) => updateField('phone', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="+1 (555) 123-4567"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={userData.dateOfBirth || ''}
                        onChange={(e) => updateField('dateOfBirth', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Address Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">Address</h3>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Street Address
                      </label>
                      <input
                        type="text"
                        value={userData.address || ''}
                        onChange={(e) => updateField('address', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="123 Main St"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          City
                        </label>
                        <input
                          type="text"
                          value={userData.city || ''}
                          onChange={(e) => updateField('city', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="New York"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          State
                        </label>
                        <input
                          type="text"
                          value={userData.state || ''}
                          onChange={(e) => updateField('state', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="NY"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          ZIP Code
                        </label>
                        <input
                          type="text"
                          value={userData.zipCode || ''}
                          onChange={(e) => updateField('zipCode', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="10001"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Country
                        </label>
                        <input
                          type="text"
                          value={userData.country || ''}
                          onChange={(e) => updateField('country', e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="United States"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Professional Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Professional Information</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Experience
                      </label>
                      <textarea
                        value={userData.experience || ''}
                        onChange={(e) => updateField('experience', e.target.value)}
                        rows={3}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="5 years of experience in software development..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Education
                      </label>
                      <textarea
                        value={userData.education || ''}
                        onChange={(e) => updateField('education', e.target.value)}
                        rows={3}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Bachelor's in Computer Science..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Skills
                    </label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {userData.skills?.map((skill, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                        >
                          {skill}
                          <button
                            onClick={() => removeSkill(index)}
                            className="ml-2 text-blue-600 hover:text-blue-800"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <button
                      onClick={addSkill}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      + Add Skill
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        LinkedIn
                      </label>
                      <input
                        type="url"
                        value={userData.linkedin || ''}
                        onChange={(e) => updateField('linkedin', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="https://linkedin.com/in/username"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        GitHub
                      </label>
                      <input
                        type="url"
                        value={userData.github || ''}
                        onChange={(e) => updateField('github', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="https://github.com/username"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Portfolio
                      </label>
                      <input
                        type="url"
                        value={userData.portfolio || ''}
                        onChange={(e) => updateField('portfolio', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="https://yourportfolio.com"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Availability
                      </label>
                      <input
                        type="text"
                        value={userData.availability || ''}
                        onChange={(e) => updateField('availability', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Immediately available"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Salary Expectation
                      </label>
                      <input
                        type="text"
                        value={userData.salary || ''}
                        onChange={(e) => updateField('salary', e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="$80,000 - $100,000"
                      />
                    </div>

                    <div className="flex items-center">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={userData.relocation || false}
                          onChange={(e) => updateField('relocation', e.target.checked)}
                          className="mr-2"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          Open to Relocation
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-between items-center pt-6 border-t border-gray-200">
                  <div className="flex space-x-4">
                    <button
                      onClick={exportData}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Export Data
                    </button>
                    <label className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">
                      Import Data
                      <input
                        type="file"
                        accept=".json"
                        onChange={importData}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <button
                    onClick={saveUserData}
                    disabled={isLoading}
                    className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isLoading ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </div>
            )}

            {/* Cache & Performance Tab */}
            {activeTab === 'cache' && (
              <div className="space-y-6">
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <span className="text-yellow-400">⚡</span>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-yellow-800">
                        Cache Management
                      </h3>
                      <div className="mt-2 text-sm text-yellow-700">
                        <p>
                          AI responses are cached to reduce API costs and improve performance. 
                          Clear the cache if you want fresh AI responses for similar questions.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-md p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Cache Statistics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">0</div>
                      <div className="text-sm text-gray-600">Cached Responses</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">$0.00</div>
                      <div className="text-sm text-gray-600">Estimated Savings</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">0ms</div>
                      <div className="text-sm text-gray-600">Avg Response Time</div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center">
                  <button
                    onClick={clearCache}
                    className="px-6 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                  >
                    Clear Cache
                  </button>
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <span className="text-blue-400">ℹ️</span>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800">
                        Extension Information
                      </h3>
                      <div className="mt-2 text-sm text-blue-700">
                        <p>
                          AI Form Filler v1.0.0 - Fill any form automatically using AI
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Privacy & Security</h3>
                  
                  <div className="bg-green-50 border border-green-200 rounded-md p-4">
                    <h4 className="font-medium text-green-800 mb-2">🔒 Data Security</h4>
                    <ul className="text-sm text-green-700 space-y-1">
                      <li>• Your API key is stored securely in Chrome's encrypted storage</li>
                      <li>• Profile data is stored locally in your browser</li>
                      <li>• No data is sent to external servers except OpenAI API</li>
                      <li>• AI responses are cached locally to reduce API calls</li>
                    </ul>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <h4 className="font-medium text-yellow-800 mb-2">💰 Cost Optimization</h4>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      <li>• Uses GPT-3.5-turbo for cost efficiency</li>
                      <li>• Caches similar responses to avoid duplicate API calls</li>
                      <li>• Limits response length to minimize token usage</li>
                      <li>• Direct field mapping reduces AI calls for common fields</li>
                    </ul>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">Support</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                      <h4 className="font-medium text-gray-800 mb-2">📖 How to Use</h4>
                      <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                        <li>Set your OpenAI API key in the popup</li>
                        <li>Fill out your profile data in this settings page</li>
                        <li>Navigate to any form and click "Fill Form with AI"</li>
                        <li>Review and submit the filled form</li>
                      </ol>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                      <h4 className="font-medium text-gray-800 mb-2">🛠️ Troubleshooting</h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• Ensure API key is valid and has credits</li>
                        <li>• Check that forms are detected on the page</li>
                        <li>• Clear cache if responses seem outdated</li>
                        <li>• Update profile data for better accuracy</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Status Message */}
            {message && (
              <div className={`mt-4 p-3 rounded-md ${
                message.includes('successfully') 
                  ? 'bg-green-100 text-green-800 border border-green-200' 
                  : 'bg-red-100 text-red-800 border border-red-200'
              }`}>
                {message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
