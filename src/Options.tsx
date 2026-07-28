import { useState, useEffect } from "react";
import type { UserData, ContextEntry } from "./types";

interface LearnedEntry {
  fieldLabel: string;
  value: string;
  domain: string;
  timestamp: number;
  source: string;
}

export default function Options() {
  const [userData, setUserData] = useState<UserData>({});
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [activeTab, setActiveTab] = useState<
    "profile" | "context" | "learning" | "settings"
  >("profile");
  const [learnedData, setLearnedData] = useState<
    Record<string, LearnedEntry[]>
  >({});
  const [learnedLoading, setLearnedLoading] = useState(false);
  const [enableLocalModels, setEnableLocalModels] = useState(false);
  const [contextEntries, setContextEntries] = useState<ContextEntry[]>([]);
  const [newContext, setNewContext] = useState({
    title: "",
    description: "",
    category: "project" as ContextEntry["category"],
    skills: "",
    impact: "",
  });

  useEffect(() => {
    loadUserData();
    loadContextEntries();
    chrome.storage.sync.get(["enableLocalModels"]).then((r) => {
      setEnableLocalModels(r.enableLocalModels === true);
    });
  }, []);

  useEffect(() => {
    if (activeTab === "learning") loadLearnedData();
    if (activeTab === "context") loadContextEntries();
  }, [activeTab]);

  const loadUserData = async () => {
    try {
      const result = await chrome.storage.sync.get(["userData"]);
      setUserData(result.userData || {});
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  const saveUserData = async () => {
    setIsLoading(true);
    try {
      await chrome.storage.sync.set({ userData });
      setMessage("Profile data saved successfully!");
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Failed to save profile data");
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (
    field: keyof UserData,
    value: string | boolean | string[],
  ) => {
    setUserData((prev) => ({ ...prev, [field]: value }));
  };

  const addSkill = () => {
    const skill = prompt("Enter a skill:");
    if (skill?.trim()) {
      setUserData((prev) => ({
        ...prev,
        skills: [...(prev.skills || []), skill.trim()],
      }));
    }
  };

  const removeSkill = (index: number) => {
    setUserData((prev) => ({
      ...prev,
      skills: prev.skills?.filter((_, i) => i !== index) || [],
    }));
  };

  const exportData = () => {
    const dataStr = JSON.stringify(userData, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fillit-profile.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        // Validate shape: must be a plain object
        if (
          typeof imported !== "object" ||
          imported === null ||
          Array.isArray(imported)
        ) {
          setMessage("Invalid file: expected a JSON object");
          setTimeout(() => setMessage(""), 3000);
          return;
        }
        setUserData(imported);
        setMessage("Data imported successfully!");
        setTimeout(() => setMessage(""), 3000);
      } catch {
        setMessage("Invalid file format");
        setTimeout(() => setMessage(""), 3000);
      }
    };
    reader.readAsText(file);
  };

  // ── Context Entries ────────────────────────────────────────────────

  const loadContextEntries = async () => {
    try {
      const resp = await chrome.runtime.sendMessage({
        action: "getContextEntries",
      });
      if (resp?.success) setContextEntries(resp.data || []);
    } catch {
      setContextEntries([]);
    }
  };

  const addContextEntry = async () => {
    if (!newContext.title.trim() || !newContext.description.trim()) return;

    const entry: ContextEntry = {
      id: `ctx_${Date.now()}`,
      title: newContext.title.trim(),
      description: newContext.description.trim(),
      category: newContext.category,
      skills: newContext.skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      impact: newContext.impact.trim() || undefined,
      timestamp: Date.now(),
    };

    try {
      await chrome.runtime.sendMessage({
        action: "saveContextEntry",
        data: entry,
      });
      setNewContext({
        title: "",
        description: "",
        category: "project",
        skills: "",
        impact: "",
      });
      await loadContextEntries();
      setMessage("Context entry added!");
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Failed to save context entry");
    }
  };

  const deleteContextEntryHandler = async (id: string) => {
    try {
      await chrome.runtime.sendMessage({
        action: "deleteContextEntry",
        data: { id },
      });
      await loadContextEntries();
      setMessage("Entry deleted");
      setTimeout(() => setMessage(""), 2000);
    } catch {
      setMessage("Failed to delete entry");
    }
  };

  // ── Learning History helpers ──────────────────────────────────────

  const loadLearnedData = async () => {
    setLearnedLoading(true);
    try {
      const resp = await chrome.runtime.sendMessage({
        action: "getLearnedData",
      });
      if (resp?.success) setLearnedData(resp.data || {});
    } catch {
      setLearnedData({});
    } finally {
      setLearnedLoading(false);
    }
  };

  const deleteLearnedEntry = async (domain: string, fieldLabel: string) => {
    try {
      await chrome.runtime.sendMessage({
        action: "deleteLearnedEntry",
        data: { domain, fieldLabel },
      });
      await loadLearnedData();
      setMessage("Entry deleted");
      setTimeout(() => setMessage(""), 2000);
    } catch {
      setMessage("Failed to delete entry");
    }
  };

  const clearAllHistory = async () => {
    if (!confirm("Clear all learning history? This cannot be undone.")) return;
    try {
      await chrome.runtime.sendMessage({ action: "clearLearnedHistory" });
      setLearnedData({});
      setMessage("Learning history cleared");
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Failed to clear history");
    }
  };

  const mergeEntryToProfile = async (entry: LearnedEntry) => {
    const updates: Record<string, string> = {};
    updates[inferProfileKey(entry.fieldLabel) || entry.fieldLabel] =
      entry.value;
    try {
      await chrome.runtime.sendMessage({
        action: "mergeLearnedToProfile",
        data: updates,
      });
      await loadUserData();
      setMessage(`Merged "${entry.fieldLabel}" → profile`);
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Failed to merge");
    }
  };

  const inferProfileKey = (label: string): string | null => {
    const map: Array<[RegExp, string]> = [
      [/email|e-?mail/, "email"],
      [/name|full\s*name/, "name"],
      [/phone|mobile|tel/, "phone"],
      [/linkedin/, "linkedin"],
      [/github/, "github"],
      [/portfolio|website/, "portfolio"],
      [/address/, "address"],
      [/city/, "city"],
      [/state|province/, "state"],
      [/zip|postal/, "zipCode"],
      [/country/, "country"],
      [/salary|ctc/, "salary"],
      [/availability/, "availability"],
    ];
    for (const [rx, key] of map) {
      if (rx.test(label)) return key;
    }
    return null;
  };

  const totalEntries = Object.values(learnedData).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg">
          <div className="border-b border-gray-200">
            <div className="px-6 py-4">
              <h1 className="text-2xl font-bold text-gray-900">
                FillIt Settings
              </h1>
              <p className="text-gray-600 mt-1">
                Manage your profile, learning history, and extension settings
              </p>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
              {[
                { id: "profile", label: "Profile Data", icon: "👤" },
                { id: "context", label: "Context Entries", icon: "📝" },
                { id: "learning", label: "Learning History", icon: "🧠" },
                { id: "settings", label: "Settings", icon: "⚙️" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* Profile Data Tab */}
            {activeTab === "profile" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Basic Information
                    </h3>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={userData.name || ""}
                        onChange={(e) => updateField("name", e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="John Doe"
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        Used to auto-split first / last name when those fields
                        are empty
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          First Name
                        </label>
                        <input
                          type="text"
                          value={userData.firstName || ""}
                          onChange={(e) =>
                            updateField("firstName", e.target.value)
                          }
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="John"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Last Name
                        </label>
                        <input
                          type="text"
                          value={userData.lastName || ""}
                          onChange={(e) =>
                            updateField("lastName", e.target.value)
                          }
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Doe"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={userData.email || ""}
                        onChange={(e) => updateField("email", e.target.value)}
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
                        value={userData.phone || ""}
                        onChange={(e) => updateField("phone", e.target.value)}
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
                        value={userData.dateOfBirth || ""}
                        onChange={(e) =>
                          updateField("dateOfBirth", e.target.value)
                        }
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* Address Information */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Address
                    </h3>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Street Address
                      </label>
                      <input
                        type="text"
                        value={userData.address || ""}
                        onChange={(e) => updateField("address", e.target.value)}
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
                          value={userData.city || ""}
                          onChange={(e) => updateField("city", e.target.value)}
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
                          value={userData.state || ""}
                          onChange={(e) => updateField("state", e.target.value)}
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
                          value={userData.zipCode || ""}
                          onChange={(e) =>
                            updateField("zipCode", e.target.value)
                          }
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
                          value={userData.country || ""}
                          onChange={(e) =>
                            updateField("country", e.target.value)
                          }
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="United States"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Professional Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Professional Information
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Experience
                      </label>
                      <textarea
                        value={userData.yearsOfExperience || ""}
                        onChange={(e) =>
                          updateField("yearsOfExperience", e.target.value)
                        }
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
                        value={userData.education || ""}
                        onChange={(e) =>
                          updateField("education", e.target.value)
                        }
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
                        value={userData.linkedin || ""}
                        onChange={(e) =>
                          updateField("linkedin", e.target.value)
                        }
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
                        value={userData.github || ""}
                        onChange={(e) => updateField("github", e.target.value)}
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
                        value={userData.portfolio || ""}
                        onChange={(e) =>
                          updateField("portfolio", e.target.value)
                        }
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
                        value={userData.availability || ""}
                        onChange={(e) =>
                          updateField("availability", e.target.value)
                        }
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
                        value={userData.salary || ""}
                        onChange={(e) => updateField("salary", e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="$80,000 - $100,000"
                      />
                    </div>
                    <div className="flex items-center">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={userData.relocation || false}
                          onChange={(e) =>
                            updateField("relocation", e.target.checked)
                          }
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
                    {isLoading ? "Saving..." : "Save Profile"}
                  </button>
                </div>
              </div>
            )}

            {/* Learning History Tab */}
            {activeTab === "learning" && (
              <div className="space-y-6">
                <div className="bg-purple-50 border border-purple-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <span className="text-purple-400">🧠</span>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-purple-800">
                        How Learning Works
                      </h3>
                      <div className="mt-2 text-sm text-purple-700">
                        <p>
                          FillIt observes the forms you submit and remembers the
                          values you use. Next time you encounter similar
                          fields, your previous answers are used automatically.
                          All data is stored locally — nothing leaves your
                          browser.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Learned Data ({totalEntries} entries from{" "}
                    {Object.keys(learnedData).length} sites)
                  </h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={loadLearnedData}
                      className="px-3 py-1 text-sm text-blue-600 border border-blue-300 rounded-md hover:bg-blue-50"
                    >
                      🔄 Refresh
                    </button>
                    {totalEntries > 0 && (
                      <button
                        onClick={clearAllHistory}
                        className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>

                {learnedLoading ? (
                  <div className="text-center py-8 text-gray-500">
                    Loading...
                  </div>
                ) : totalEntries === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <div className="text-4xl mb-2">📝</div>
                    <p>
                      No learned data yet. Fill and submit some forms to get
                      started!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(learnedData).map(([domain, entries]) => (
                      <div
                        key={domain}
                        className="border border-gray-200 rounded-md overflow-hidden"
                      >
                        <div className="bg-gray-100 px-4 py-2 flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-800">
                            🌐 {domain}
                          </span>
                          <span className="text-xs text-gray-500">
                            {entries.length} fields
                          </span>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {entries.map((entry, idx) => (
                            <div
                              key={idx}
                              className="px-4 py-2 flex items-center justify-between hover:bg-gray-50"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-gray-800 truncate">
                                  <span className="font-medium">
                                    {entry.fieldLabel}:
                                  </span>{" "}
                                  <span className="text-gray-600">
                                    {entry.value}
                                  </span>
                                </div>
                                <div className="text-xs text-gray-400">
                                  {new Date(
                                    entry.timestamp,
                                  ).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="flex items-center space-x-1 ml-2">
                                <button
                                  onClick={() => mergeEntryToProfile(entry)}
                                  className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                                  title="Add to profile"
                                >
                                  ➕ Profile
                                </button>
                                <button
                                  onClick={() =>
                                    deleteLearnedEntry(domain, entry.fieldLabel)
                                  }
                                  className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                                  title="Delete"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Context Entries Tab */}
            {activeTab === "context" && (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <span className="text-blue-400">💡</span>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800">
                        What are Context Entries?
                      </h3>
                      <div className="mt-2 text-sm text-blue-700">
                        <p>
                          Add your projects, experiences, and achievements.
                          When forms ask "Describe a project you worked on" or
                          "Tell us about a leadership experience," FillIt pulls
                          the most relevant entry and generates a natural answer.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-md p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Add Context Entry
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Title
                      </label>
                      <input
                        type="text"
                        value={newContext.title}
                        onChange={(e) =>
                          setNewContext((prev) => ({
                            ...prev,
                            title: e.target.value,
                          }))
                        }
                        className="w-full p-2 border border-gray-300 rounded-md"
                        placeholder="E-commerce Platform"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description (2-5 sentences)
                      </label>
                      <textarea
                        value={newContext.description}
                        onChange={(e) =>
                          setNewContext((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                        rows={4}
                        className="w-full p-2 border border-gray-300 rounded-md"
                        placeholder="Built a full-stack e-commerce platform using React and Node.js. Handled 10k+ daily users..."
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Category
                        </label>
                        <select
                          value={newContext.category}
                          onChange={(e) =>
                            setNewContext((prev) => ({
                              ...prev,
                              category: e.target
                                .value as ContextEntry["category"],
                            }))
                          }
                          className="w-full p-2 border border-gray-300 rounded-md"
                        >
                          <option value="project">Project</option>
                          <option value="experience">Experience</option>
                          <option value="achievement">Achievement</option>
                          <option value="leadership">Leadership</option>
                          <option value="education">Education</option>
                          <option value="certification">Certification</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Impact (optional)
                        </label>
                        <input
                          type="text"
                          value={newContext.impact}
                          onChange={(e) =>
                            setNewContext((prev) => ({
                              ...prev,
                              impact: e.target.value,
                            }))
                          }
                          className="w-full p-2 border border-gray-300 rounded-md"
                          placeholder="Increased revenue by 30%"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Skills (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={newContext.skills}
                        onChange={(e) =>
                          setNewContext((prev) => ({
                            ...prev,
                            skills: e.target.value,
                          }))
                        }
                        className="w-full p-2 border border-gray-300 rounded-md"
                        placeholder="React, Node.js, TypeScript"
                      />
                    </div>
                    <button
                      onClick={addContextEntry}
                      disabled={!newContext.title || !newContext.description}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      Add Entry
                    </button>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Your Context Entries ({contextEntries.length})
                  </h3>
                  {contextEntries.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <div className="text-4xl mb-2">📝</div>
                      <p>No context entries yet. Add some above!</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {contextEntries
                        .sort((a, b) => b.timestamp - a.timestamp)
                        .map((entry) => (
                          <div
                            key={entry.id}
                            className="border border-gray-200 rounded-md p-4 hover:bg-gray-50"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-1">
                                  <span className="font-medium text-gray-900">
                                    {entry.title}
                                  </span>
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                    {entry.category}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600">
                                  {entry.description}
                                </p>
                                {entry.impact && (
                                  <p className="text-sm text-green-600 mt-1">
                                    Impact: {entry.impact}
                                  </p>
                                )}
                                {entry.skills && entry.skills.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {entry.skills.map((skill, i) => (
                                      <span
                                        key={i}
                                        className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700"
                                      >
                                        {skill}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => deleteContextEntryHandler(entry.id)}
                                className="ml-3 text-red-500 hover:text-red-700 text-sm"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === "settings" && (
              <div className="space-y-6">
                <div className="bg-green-50 border border-green-200 rounded-md p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <span className="text-green-400">🔒</span>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-green-800">
                        Privacy & Security
                      </h3>
                      <div className="mt-2 text-sm text-green-700">
                        <p>
                          Your data is stored exclusively in your browser's
                          local storage. FillIt never uploads, syncs, or
                          transmits your personal information. We don't have
                          servers or databases — everything stays on your
                          device.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Matching engine
                  </h3>
                  <div className="flex items-start justify-between gap-4 p-4 border border-gray-200 rounded-lg bg-white">
                    <div>
                      <div className="text-sm font-medium text-gray-800">
                        Experimental on-device models
                      </div>
                      <p className="text-xs text-gray-500 mt-1 max-w-md">
                        Off by default. When on, downloads MiniLM (~25MB) and
                        optionally Flan-T5 from Hugging Face for semantic match
                        / short generation. Can show WASM warnings in the
                        extension error page and slow first fill. Recommended:
                        leave off — synonym + fuzzy matching is enough for most
                        forms.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enableLocalModels}
                      onClick={async () => {
                        const next = !enableLocalModels;
                        setEnableLocalModels(next);
                        await chrome.storage.sync.set({
                          enableLocalModels: next,
                        });
                        setMessage(
                          next
                            ? "On-device models enabled (reload form tabs)"
                            : "On-device models disabled",
                        );
                        setTimeout(() => setMessage(""), 3000);
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                        enableLocalModels ? "bg-blue-600" : "bg-gray-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                          enableLocalModels
                            ? "translate-x-5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Data Management
                  </h3>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>• Profile data is stored in Chrome's sync storage</li>
                    <li>• Learning history is stored locally in your browser</li>
                    <li>• Context entries are stored locally in your browser</li>
                    <li>
                      • Form answers are never uploaded; optional models only
                      download weights from Hugging Face when enabled
                    </li>
                    <li>
                      • You can export all your data at any time from the
                      Profile tab
                    </li>
                  </ul>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    About FillIt
                  </h3>
                  <p className="text-sm text-gray-600">
                    FillIt matches form fields to your profile with synonym and
                    fuzzy matching, plus your context entries. No API keys
                    required. Optional on-device models can be enabled above for
                    experimental semantic matching — left off by default for
                    speed and a clean error console.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                    <h4 className="font-medium text-gray-800 mb-2">
                      📖 How to Use
                    </h4>
                    <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                      <li>Fill out your profile data in the Profile tab</li>
                      <li>
                        Add context entries (projects, experiences) in the
                        Context tab
                      </li>
                      <li>
                        Navigate to any form and click "Fill Form" in the popup
                      </li>
                      <li>Review, edit if needed, and submit the form</li>
                      <li>
                        FillIt learns from your submissions automatically
                      </li>
                    </ol>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
                    <h4 className="font-medium text-gray-800 mb-2">
                      💡 Tips for Best Results
                    </h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Add at least 2-3 context entries for richer answers</li>
                      <li>• Enable survey mode for random survey answers</li>
                      <li>• Update profile regularly as you add info</li>
                      <li>• Use the refresh button if form changes</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Status Message */}
            {message && (
              <div
                className={`mt-4 p-3 rounded-md ${
                  message.includes("successfully") ||
                  message.includes("Merged") ||
                  message.includes("cleared") ||
                  message.includes("deleted")
                    ? "bg-green-100 text-green-800 border border-green-200"
                    : message.includes("Failed") || message.includes("Invalid")
                      ? "bg-red-100 text-red-800 border border-red-200"
                      : "bg-blue-100 text-blue-800 border border-blue-200"
                }`}
              >
                {message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
