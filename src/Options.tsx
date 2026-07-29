import { useState, useEffect } from "react";
import type { UserData, ContextEntry } from "./types";
import {
  User,
  FileText,
  Brain,
  Settings,
  Download,
  Upload,
  Save,
  X,
  Trash2,
  MapPin,
  Globe,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Sun,
  Moon
} from "lucide-react";

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
  const [theme, setTheme] = useState<"dark" | "light">("dark");
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
    chrome.storage.sync.get(["enableLocalModels", "theme"]).then((r) => {
      setEnableLocalModels(r.enableLocalModels === true);
      if (r.theme === "light" || r.theme === "dark") {
        setTheme(r.theme);
      }
    });

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.theme) {
        setTheme(changes.theme.newValue === "light" ? "light" : "dark");
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    if (activeTab === "learning") loadLearnedData();
    if (activeTab === "context") loadContextEntries();
  }, [activeTab]);

  const toggleTheme = async () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    await chrome.storage.sync.set({ theme: nextTheme });
  };

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
      setMessage("Profile saved");
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Failed to save profile");
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
    const skill = prompt("Add skill:");
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
        if (
          typeof imported !== "object" ||
          imported === null ||
          Array.isArray(imported)
        ) {
          setMessage("Invalid JSON format");
          setTimeout(() => setMessage(""), 3000);
          return;
        }
        setUserData(imported);
        setMessage("Data imported");
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
      setMessage("Context entry added");
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
    if (!confirm("Clear all learned form entries?")) return;
    try {
      await chrome.runtime.sendMessage({ action: "clearLearnedHistory" });
      setLearnedData({});
      setMessage("History cleared");
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
      setMessage(`Saved "${entry.fieldLabel}" to profile`);
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

  const isDark = theme === "dark";

  return (
    <div
      className={`min-h-screen font-sans text-sm antialiased pb-16 transition-colors duration-150 ${
        isDark
          ? "bg-[#09090b] text-[#fafafa]"
          : "bg-[#e9ecef] text-[#0f172a]"
      }`}
    >
      {/* Top Bar */}
      <header
        className={`border-b sticky top-0 z-40 backdrop-blur-md transition-colors duration-150 ${
          isDark
            ? "bg-[#09090b]/90 border-[#18181b]"
            : "bg-[#e9ecef]/90 border-[#d5d8e0]"
        }`}
      >
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-white text-xs ${
                isDark ? "bg-[#e11d48]" : "bg-[#e0562e]"
              }`}
            >
              F
            </div>
            <span className="font-semibold text-base tracking-tight">FillIt</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleTheme}
              className={`p-1.5 rounded-md border text-xs font-medium transition-all ${
                isDark
                  ? "bg-[#18181b] border-[#27272a] text-zinc-300 hover:text-white"
                  : "bg-white border-[#dcdfe4] text-slate-700 hover:text-black"
              }`}
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-rose-500" />}
            </button>

            <button
              onClick={exportData}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                isDark
                  ? "bg-[#18181b] border-[#27272a] text-zinc-300 hover:text-white"
                  : "bg-white border-[#dcdfe4] text-slate-700 hover:text-black"
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>

            <label
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all cursor-pointer ${
                isDark
                  ? "bg-[#18181b] border-[#27272a] text-zinc-300 hover:text-white"
                  : "bg-white border-[#dcdfe4] text-slate-700 hover:text-black"
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import</span>
              <input
                type="file"
                accept=".json"
                onChange={importData}
                className="hidden"
              />
            </label>

            <button
              onClick={saveUserData}
              disabled={isLoading}
              className={`inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium text-white transition-all ${
                isDark
                  ? "bg-[#e11d48] hover:bg-[#be123c]"
                  : "bg-[#e0562e] hover:bg-[#c2410c]"
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isLoading ? "Saving..." : "Save"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl mx-auto px-6 pt-6 space-y-6">
        {/* Clean Segment Tabs */}
        <div
          className={`flex p-1 rounded-lg border text-xs font-medium ${
            isDark
              ? "bg-[#141417] border-[#27272a]"
              : "bg-[#dce0e5] border-[#d0d4dc]"
          }`}
        >
          {[
            { id: "profile", label: "Profile Data", icon: User },
            { id: "context", label: "Context Memory", icon: FileText },
            { id: "learning", label: "Field Memory", icon: Brain },
            { id: "settings", label: "Settings", icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex-1 py-2 px-3 rounded-md flex items-center justify-center space-x-1.5 transition-all ${
                  isActive
                    ? isDark
                      ? "bg-[#e11d48] text-white shadow-sm font-semibold"
                      : "bg-[#253549] text-white shadow-sm font-semibold"
                    : isDark
                      ? "text-zinc-400 hover:text-white"
                      : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Status Toast */}
        {message && (
          <div
            className={`p-3 rounded-lg text-xs font-medium border flex items-center space-x-2 ${
              message.includes("Failed") || message.includes("Invalid")
                ? isDark
                  ? "bg-[#271015] border-[#5e1927] text-rose-300"
                  : "bg-red-50 border-red-200 text-red-700"
                : isDark
                  ? "bg-[#0e2417] border-[#1c4d2d] text-emerald-300"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}
          >
            {message.includes("Failed") || message.includes("Invalid") ? (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{message}</span>
          </div>
        )}

        {/* TAB 1: PROFILE DATA */}
        {activeTab === "profile" && (
          <div className="space-y-6">
            {/* General Info */}
            <div
              className={`p-5 rounded-xl border space-y-4 ${
                isDark
                  ? "bg-[#121215] border-[#22222a]"
                  : "bg-white border-[#dcdfe4]"
              }`}
            >
              <div className="flex items-center space-x-2 pb-3 border-b border-zinc-500/10">
                <User className={`w-4 h-4 ${isDark ? "text-rose-500" : "text-[#e0562e]"}`} />
                <h2 className="font-semibold text-sm">Personal Details</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={userData.name || ""}
                    onChange={(e) => updateField("name", e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                      isDark
                        ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                        : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                    }`}
                    placeholder="John Doe"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      First Name
                    </label>
                    <input
                      type="text"
                      value={userData.firstName || ""}
                      onChange={(e) => updateField("firstName", e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                        isDark
                          ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                          : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                      }`}
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={userData.lastName || ""}
                      onChange={(e) => updateField("lastName", e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                        isDark
                          ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                          : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                      }`}
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={userData.email || ""}
                    onChange={(e) => updateField("email", e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                      isDark
                        ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                        : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                    }`}
                    placeholder="john@example.com"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={userData.phone || ""}
                      onChange={(e) => updateField("phone", e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                        isDark
                          ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                          : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                      }`}
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={userData.dateOfBirth || ""}
                      onChange={(e) => updateField("dateOfBirth", e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                        isDark
                          ? "bg-[#18181c] border-[#2a2a34] text-white [color-scheme:dark]"
                          : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 [color-scheme:light]"
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Address */}
            <div
              className={`p-5 rounded-xl border space-y-4 ${
                isDark
                  ? "bg-[#121215] border-[#22222a]"
                  : "bg-white border-[#dcdfe4]"
              }`}
            >
              <div className="flex items-center space-x-2 pb-3 border-b border-zinc-500/10">
                <MapPin className={`w-4 h-4 ${isDark ? "text-rose-500" : "text-[#e0562e]"}`} />
                <h2 className="font-semibold text-sm">Address Information</h2>
              </div>

              <div className="space-y-3">
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    Street Address
                  </label>
                  <input
                    type="text"
                    value={userData.address || ""}
                    onChange={(e) => updateField("address", e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                      isDark
                        ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                        : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                    }`}
                    placeholder="123 Main St"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      City
                    </label>
                    <input
                      type="text"
                      value={userData.city || ""}
                      onChange={(e) => updateField("city", e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                        isDark
                          ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                          : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                      }`}
                      placeholder="New York"
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      State
                    </label>
                    <input
                      type="text"
                      value={userData.state || ""}
                      onChange={(e) => updateField("state", e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                        isDark
                          ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                          : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                      }`}
                      placeholder="NY"
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      ZIP Code
                    </label>
                    <input
                      type="text"
                      value={userData.zipCode || ""}
                      onChange={(e) => updateField("zipCode", e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                        isDark
                          ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                          : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                      }`}
                      placeholder="10001"
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      Country
                    </label>
                    <input
                      type="text"
                      value={userData.country || ""}
                      onChange={(e) => updateField("country", e.target.value)}
                      className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                        isDark
                          ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                          : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                      }`}
                      placeholder="United States"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Professional Details */}
            <div
              className={`p-5 rounded-xl border space-y-4 ${
                isDark
                  ? "bg-[#121215] border-[#22222a]"
                  : "bg-white border-[#dcdfe4]"
              }`}
            >
              <div className="flex items-center space-x-2 pb-3 border-b border-zinc-500/10">
                <Briefcase className={`w-4 h-4 ${isDark ? "text-rose-500" : "text-[#e0562e]"}`} />
                <h2 className="font-semibold text-sm">Professional Profile</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    Experience Summary
                  </label>
                  <textarea
                    value={userData.yearsOfExperience || ""}
                    onChange={(e) => updateField("yearsOfExperience", e.target.value)}
                    rows={3}
                    className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none resize-none ${
                      isDark
                        ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                        : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                    }`}
                    placeholder="5+ years in software engineering..."
                  />
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    Education Summary
                  </label>
                  <textarea
                    value={userData.education || ""}
                    onChange={(e) => updateField("education", e.target.value)}
                    rows={3}
                    className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none resize-none ${
                      isDark
                        ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                        : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                    }`}
                    placeholder="B.S. in Computer Science..."
                  />
                </div>
              </div>

              {/* Skills */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={`text-xs font-medium ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    Skills
                  </label>
                  <button
                    onClick={addSkill}
                    className="text-xs text-rose-500 hover:underline font-medium"
                  >
                    + Add skill
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {userData.skills?.map((skill, index) => (
                    <span
                      key={index}
                      className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs border ${
                        isDark
                          ? "bg-[#18181c] border-[#2a2a34] text-zinc-300"
                          : "bg-slate-100 border-slate-200 text-slate-800"
                      }`}
                    >
                      <span>{skill}</span>
                      <button
                        onClick={() => removeSkill(index)}
                        className="hover:text-rose-500 ml-1 text-zinc-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Links */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    LinkedIn
                  </label>
                  <input
                    type="url"
                    value={userData.linkedin || ""}
                    onChange={(e) => updateField("linkedin", e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                      isDark
                        ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                        : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                    }`}
                    placeholder="https://linkedin.com/in/username"
                  />
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    GitHub
                  </label>
                  <input
                    type="url"
                    value={userData.github || ""}
                    onChange={(e) => updateField("github", e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                      isDark
                        ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                        : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                    }`}
                    placeholder="https://github.com/username"
                  />
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    Portfolio
                  </label>
                  <input
                    type="url"
                    value={userData.portfolio || ""}
                    onChange={(e) => updateField("portfolio", e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                      isDark
                        ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                        : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                    }`}
                    placeholder="https://portfolio.com"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CONTEXT ENTRIES */}
        {activeTab === "context" && (
          <div className="space-y-6">
            {/* Add Entry Card */}
            <div
              className={`p-5 rounded-xl border space-y-4 ${
                isDark
                  ? "bg-[#121215] border-[#22222a]"
                  : "bg-white border-[#dcdfe4]"
              }`}
            >
              <h2 className="font-semibold text-sm">Add Context Entry</h2>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      Title
                    </label>
                    <input
                      type="text"
                      value={newContext.title}
                      onChange={(e) => setNewContext((prev) => ({ ...prev, title: e.target.value }))}
                      className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                        isDark
                          ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                          : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                      }`}
                      placeholder="Project or Leadership Title"
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      Category
                    </label>
                    <select
                      value={newContext.category}
                      onChange={(e) =>
                        setNewContext((prev) => ({
                          ...prev,
                          category: e.target.value as ContextEntry["category"],
                        }))
                      }
                      className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                        isDark
                          ? "bg-[#18181c] border-[#2a2a34] text-white"
                          : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900"
                      }`}
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
                </div>

                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                    Description
                  </label>
                  <textarea
                    value={newContext.description}
                    onChange={(e) => setNewContext((prev) => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none resize-none ${
                      isDark
                        ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                        : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                    }`}
                    placeholder="Describe your role, responsibilities, and achievements..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      Impact (optional)
                    </label>
                    <input
                      type="text"
                      value={newContext.impact}
                      onChange={(e) => setNewContext((prev) => ({ ...prev, impact: e.target.value }))}
                      className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                        isDark
                          ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                          : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                      }`}
                      placeholder="e.g. Increased speed by 40%"
                    />
                  </div>
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      Skills (comma separated)
                    </label>
                    <input
                      type="text"
                      value={newContext.skills}
                      onChange={(e) => setNewContext((prev) => ({ ...prev, skills: e.target.value }))}
                      className={`w-full px-3 py-2 text-xs rounded-md border focus:outline-none ${
                        isDark
                          ? "bg-[#18181c] border-[#2a2a34] text-white focus:border-rose-500"
                          : "bg-[#f8fafc] border-[#dcdfe4] text-slate-900 focus:border-[#e0562e]"
                      }`}
                      placeholder="React, Node.js, AWS"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={addContextEntry}
                    disabled={!newContext.title || !newContext.description}
                    className={`px-4 py-2 text-xs font-medium rounded-md text-white transition-all ${
                      isDark ? "bg-[#e11d48] hover:bg-[#be123c]" : "bg-[#e0562e] hover:bg-[#c2410c]"
                    } disabled:opacity-50`}
                  >
                    Add Context
                  </button>
                </div>
              </div>
            </div>

            {/* Existing Entries */}
            <div className="space-y-3">
              <h2 className="font-semibold text-sm">Saved Entries ({contextEntries.length})</h2>
              {contextEntries.length === 0 ? (
                <div
                  className={`p-8 text-center rounded-xl border ${
                    isDark
                      ? "bg-[#121215] border-[#22222a] text-zinc-500"
                      : "bg-white border-[#dcdfe4] text-slate-500"
                  }`}
                >
                  No context entries yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {contextEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`p-4 rounded-xl border flex items-start justify-between ${
                        isDark
                          ? "bg-[#121215] border-[#22222a]"
                          : "bg-white border-[#dcdfe4]"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-sm">{entry.title}</span>
                          <span
                            className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded ${
                              isDark
                                ? "bg-[#1f1618] text-rose-400 border border-[#3d1a22]"
                                : "bg-orange-50 text-orange-700 border border-orange-200"
                            }`}
                          >
                            {entry.category}
                          </span>
                        </div>
                        <p className={`text-xs ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                          {entry.description}
                        </p>
                        {entry.impact && (
                          <div className="text-xs text-emerald-500">
                            Impact: {entry.impact}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => deleteContextEntryHandler(entry.id)}
                        className="text-zinc-500 hover:text-rose-500 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: FIELD MEMORY */}
        {activeTab === "learning" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">
                Recorded Form Answers ({totalEntries})
              </h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={loadLearnedData}
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium ${
                    isDark
                      ? "bg-[#18181b] border-[#27272a] text-zinc-300 hover:text-white"
                      : "bg-white border-[#dcdfe4] text-slate-700 hover:text-black"
                  }`}
                >
                  Refresh
                </button>
                {totalEntries > 0 && (
                  <button
                    onClick={clearAllHistory}
                    className="px-3 py-1.5 rounded-md border border-rose-500/30 text-rose-500 text-xs font-medium hover:bg-rose-500/10"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {learnedLoading ? (
              <div className="p-8 text-center text-zinc-500 text-xs">Loading form memories...</div>
            ) : totalEntries === 0 ? (
              <div
                className={`p-8 text-center rounded-xl border ${
                  isDark
                    ? "bg-[#121215] border-[#22222a] text-zinc-500"
                    : "bg-white border-[#dcdfe4] text-slate-500"
                }`}
              >
                No form memories stored yet. Fill forms on any website to auto-save field values.
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(learnedData).map(([domain, entries]) => (
                  <div
                    key={domain}
                    className={`rounded-xl border overflow-hidden ${
                      isDark
                        ? "bg-[#121215] border-[#22222a]"
                        : "bg-white border-[#dcdfe4]"
                    }`}
                  >
                    <div
                      className={`px-4 py-2 border-b font-medium text-xs flex justify-between ${
                        isDark ? "bg-[#18181c] border-[#22222a]" : "bg-[#f8fafc] border-[#dcdfe4]"
                      }`}
                    >
                      <span className="flex items-center space-x-1.5">
                        <Globe className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{domain}</span>
                      </span>
                      <span className="text-zinc-500">{entries.length} fields</span>
                    </div>

                    <div className="divide-y divide-zinc-500/10">
                      {entries.map((entry, idx) => (
                        <div
                          key={idx}
                          className="px-4 py-2.5 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-medium text-zinc-400">{entry.fieldLabel}: </span>
                            <span>{entry.value}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => mergeEntryToProfile(entry)}
                              className="text-xs text-rose-500 hover:underline"
                            >
                              + Profile
                            </button>
                            <button
                              onClick={() => deleteLearnedEntry(domain, entry.fieldLabel)}
                              className="text-zinc-500 hover:text-rose-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

        {/* TAB 4: SETTINGS */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            <div
              className={`p-5 rounded-xl border space-y-4 ${
                isDark
                  ? "bg-[#121215] border-[#22222a]"
                  : "bg-white border-[#dcdfe4]"
              }`}
            >
              <h2 className="font-semibold text-sm">Matching Engine</h2>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-xs">On-Device LLM Models (WASM)</div>
                  <div className={`text-xs ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                    Downloads local MiniLM & Flan-T5 model weights for semantic matching.
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enableLocalModels}
                  onClick={async () => {
                    const next = !enableLocalModels;
                    setEnableLocalModels(next);
                    await chrome.storage.sync.set({ enableLocalModels: next });
                  }}
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                    enableLocalModels
                      ? isDark ? "bg-[#e11d48]" : "bg-[#e0562e]"
                      : "bg-zinc-600/30"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      enableLocalModels ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div
              className={`p-5 rounded-xl border space-y-2 text-xs ${
                isDark
                  ? "bg-[#121215] border-[#22222a] text-zinc-400"
                  : "bg-white border-[#dcdfe4] text-slate-600"
              }`}
            >
              <div className="font-semibold text-sm text-zinc-300">Privacy</div>
              <p>
                All data, history, and context entries are stored 100% locally in your browser storage.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
