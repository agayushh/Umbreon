import { useState, useEffect } from "react";
import type { UserData, ContextEntry, LearnedEntry } from "./types";
import {
  parseResumeOrLinkedInText,
  parseImportedFile,
  parseProfileObject,
  type ExtractionResult,
} from "./resumeParser";
import {
  loadUserData as loadStoredUserData,
  saveUserData as persistUserData,
  mergeUserData,
} from "./profileStore";
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
  Moon,
  Sparkles,
  FileUp,
  Check
} from "lucide-react";

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
  });

  // Resume & LinkedIn Extractor Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [resumeText, setResumeText] = useState("");
  const [extractedResult, setExtractedResult] = useState<ExtractionResult | null>(null);

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
      setUserData(await loadStoredUserData());
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  const saveUserData = async () => {
    setIsLoading(true);
    try {
      await persistUserData(userData);
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

  // ── Complete Backup Export & Import ────────────────────────────────

  const exportFullData = async () => {
    try {
      const [contextResp, learnedResp] = await Promise.all([
        chrome.runtime.sendMessage({ action: "getContextEntries" }),
        chrome.runtime.sendMessage({ action: "getLearnedData" }),
      ]);
      const entries = contextResp?.data || contextEntries || [];
      const learned = learnedResp?.data || learnedData || {};
      const backupData = {
        version: "1.0.0",
        exportedAt: new Date().toISOString(),
        userData,
        contextEntries: entries,
        learnedData: learned,
      };

      const dataStr = JSON.stringify(backupData, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fillit-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);

      setMessage("Backup exported locally as JSON");
      setTimeout(() => setMessage(""), 3500);
    } catch (err) {
      console.error("Export error:", err);
      setMessage("Export failed");
    }
  };

  const applyParsedImport = async (parsed: ExtractionResult) => {
    if (Object.keys(parsed.userData).length > 0 || parsed.extractedSkills.length > 0) {
      const merged = await mergeUserData({
        ...parsed.userData,
        skills: parsed.extractedSkills.length
          ? parsed.extractedSkills
          : parsed.userData.skills,
      });
      setUserData(merged);
    }

    if (parsed.contextEntries.length > 0) {
      for (const ctx of parsed.contextEntries) {
        await chrome.runtime.sendMessage({
          action: "saveContextEntry",
          data: {
            id: `ctx_imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title: ctx.title,
            description: ctx.description,
            category: ctx.category,
            skills: ctx.skills,
            impact: ctx.impact,
            timestamp: Date.now(),
          },
        });
      }
      await loadContextEntries();
    }

    if (parsed.learnedData && Object.keys(parsed.learnedData).length > 0) {
      await chrome.runtime.sendMessage({
        action: "importLearnedData",
        data: parsed.learnedData,
      });
    }
  };

  const importFullData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const raw = e.target?.result as string;
        const imported = JSON.parse(raw);
        const parsed = parseProfileObject(imported);

        if (
          Object.keys(parsed.userData).length === 0 &&
          parsed.contextEntries.length === 0 &&
          !parsed.learnedData
        ) {
          setMessage("JSON had no recognizable profile fields");
          setTimeout(() => setMessage(""), 4000);
          return;
        }

        await applyParsedImport(parsed);
        setMessage("JSON backup imported — profile is ready to fill forms");
        setTimeout(() => setMessage(""), 4000);
      } catch (err) {
        console.error("Import error:", err);
        setMessage("Invalid JSON file format");
        setTimeout(() => setMessage(""), 3500);
      }
    };
    reader.readAsText(file);
  };

  // ── Resume & LinkedIn Extractor Handler ────────────────────────────

  const handleParseText = () => {
    if (!resumeText.trim()) return;
    const result = parseResumeOrLinkedInText(resumeText);
    setExtractedResult(result);
  };

  const handleFileUploadForExtraction = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    try {
      setMessage("Reading file...");
      const result = await parseImportedFile(file);
      setExtractedResult(result);
      setResumeText(result.rawTextPreview || "");
      const kind =
        result.source === "json"
          ? "JSON profile"
          : result.source === "linkedin"
            ? "LinkedIn profile"
            : "Resume";
      setMessage(`${kind} parsed — review and apply below`);
      setTimeout(() => setMessage(""), 3500);
    } catch (err) {
      console.error("Import file error:", err);
      setMessage(err instanceof Error ? err.message : "Failed to read file");
      setTimeout(() => setMessage(""), 4000);
    }
  };

  const handleApplyExtractedData = async () => {
    if (!extractedResult) return;

    try {
      await applyParsedImport(extractedResult);
      setMessage("Extracted profile & context applied — you can fill forms now");
      setTimeout(() => setMessage(""), 4000);
      setIsImportModalOpen(false);
      setResumeText("");
      setExtractedResult(null);
    } catch (err) {
      console.error("Apply extracted data error:", err);
      setMessage("Failed to apply imported profile");
      setTimeout(() => setMessage(""), 4000);
    }
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
      });
      await loadContextEntries();
      setMessage("Context entry added");
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Failed to save entry");
    }
  };

  const deleteContextEntry = async (id: string) => {
    try {
      await chrome.runtime.sendMessage({
        action: "deleteContextEntry",
        data: { id },
      });
      await loadContextEntries();
      setMessage("Context entry removed");
      setTimeout(() => setMessage(""), 2000);
    } catch {
      setMessage("Failed to delete entry");
    }
  };

  // ── Field Memory (Learned Data) ────────────────────────────────────

  const loadLearnedData = async () => {
    setLearnedLoading(true);
    try {
      const resp = await chrome.runtime.sendMessage({
        action: "getLearnedData",
      });
      if (resp?.success) setLearnedData(resp.data || {});
      else setLearnedData({});
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
      [/current\s*role|title|position/, "currentRole"],
      [/experience|years/, "yearsOfExperience"],
      [/education|degree|qualification/, "education"],
    ];
    const match = map.find(([rx]) => rx.test(label.toLowerCase()));
    return match ? match[1] : null;
  };

  const isDark = theme === "dark";

  return (
    <div
      className={`min-h-screen font-sans text-xs antialiased pb-12 transition-colors ${
        isDark
          ? "bg-[#09090b] text-[#fafafa]"
          : "bg-[#e9ecef] text-[#0f172a]"
      }`}
    >
      {/* Header Bar */}
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-md transition-colors ${
          isDark
            ? "bg-[#09090b]/90 border-[#1f1f23]"
            : "bg-[#e9ecef]/90 border-[#d0d4dc]"
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
            <span className="font-semibold text-sm tracking-tight">FillIt Settings</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleTheme}
              className={`p-1.5 rounded-md border transition-colors ${
                isDark
                  ? "bg-[#18181b] border-[#27272a] text-zinc-300 hover:text-white"
                  : "bg-white border-[#dcdfe4] text-slate-700 hover:text-black"
              }`}
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-rose-500" />}
            </button>

            <button
              onClick={() => setIsImportModalOpen(true)}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                isDark
                  ? "bg-[#1f1317] border-[#4c1d28] text-rose-300 hover:text-rose-100"
                  : "bg-orange-50 border-orange-200 text-orange-800 hover:text-orange-950"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Import Resume / LinkedIn</span>
            </button>

            <button
              onClick={exportFullData}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                isDark
                  ? "bg-[#18181b] border-[#27272a] text-zinc-300 hover:text-white"
                  : "bg-white border-[#dcdfe4] text-slate-700 hover:text-black"
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>

            <label
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all cursor-pointer ${
                isDark
                  ? "bg-[#18181b] border-[#27272a] text-zinc-300 hover:text-white"
                  : "bg-white border-[#dcdfe4] text-slate-700 hover:text-black"
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import JSON</span>
              <input
                type="file"
                accept=".json"
                onChange={importFullData}
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
                  ? "bg-[#0e271d] border-[#1b5e43] text-emerald-300"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800"
            }`}
          >
            {message.includes("Failed") || message.includes("Invalid") ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{message}</span>
          </div>
        )}

        {/* Tab 1: Profile Data */}
        {activeTab === "profile" && (
          <div className="space-y-6">
            {/* Personal Details */}
            <div
              className={`p-5 rounded-xl border space-y-4 ${
                isDark
                  ? "bg-[#121215] border-[#22222a]"
                  : "bg-white border-[#dcdfe4]"
              }`}
            >
              <div className="flex items-center space-x-2 pb-2 border-b border-zinc-500/10 font-semibold text-xs text-zinc-400">
                <User className="w-4 h-4 text-rose-500" />
                <span className="text-white font-medium text-sm">Personal Details</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Full Name</label>
                  <input
                    type="text"
                    value={userData.name || ""}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="Ayush Goyal"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">First Name</label>
                  <input
                    type="text"
                    value={userData.firstName || ""}
                    onChange={(e) => updateField("firstName", e.target.value)}
                    placeholder="Ayush"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Last Name</label>
                  <input
                    type="text"
                    value={userData.lastName || ""}
                    onChange={(e) => updateField("lastName", e.target.value)}
                    placeholder="Goyal"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[11px] text-zinc-400">Email Address</label>
                  <input
                    type="email"
                    value={userData.email || ""}
                    onChange={(e) => updateField("email", e.target.value)}
                    placeholder="ayush@example.com"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Phone</label>
                  <input
                    type="text"
                    value={userData.phone || ""}
                    onChange={(e) => updateField("phone", e.target.value)}
                    placeholder="+1 555-0199"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Date of Birth</label>
                  <input
                    type="date"
                    value={userData.dateOfBirth || ""}
                    onChange={(e) => updateField("dateOfBirth", e.target.value)}
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Address Information */}
            <div
              className={`p-5 rounded-xl border space-y-4 ${
                isDark
                  ? "bg-[#121215] border-[#22222a]"
                  : "bg-white border-[#dcdfe4]"
              }`}
            >
              <div className="flex items-center space-x-2 pb-2 border-b border-zinc-500/10 font-semibold text-xs text-zinc-400">
                <MapPin className="w-4 h-4 text-rose-500" />
                <span className="text-white font-medium text-sm">Address Information</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1 md:col-span-4">
                  <label className="text-[11px] text-zinc-400">Street Address</label>
                  <input
                    type="text"
                    value={userData.address || ""}
                    onChange={(e) => updateField("address", e.target.value)}
                    placeholder="123 Innovation Way"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[11px] text-zinc-400">City</label>
                  <input
                    type="text"
                    value={userData.city || ""}
                    onChange={(e) => updateField("city", e.target.value)}
                    placeholder="San Francisco"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">State</label>
                  <input
                    type="text"
                    value={userData.state || ""}
                    onChange={(e) => updateField("state", e.target.value)}
                    placeholder="CA"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">ZIP Code</label>
                  <input
                    type="text"
                    value={userData.zipCode || ""}
                    onChange={(e) => updateField("zipCode", e.target.value)}
                    placeholder="94105"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[11px] text-zinc-400">Country</label>
                  <input
                    type="text"
                    value={userData.country || ""}
                    onChange={(e) => updateField("country", e.target.value)}
                    placeholder="United States"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Professional Profile */}
            <div
              className={`p-5 rounded-xl border space-y-4 ${
                isDark
                  ? "bg-[#121215] border-[#22222a]"
                  : "bg-white border-[#dcdfe4]"
              }`}
            >
              <div className="flex items-center space-x-2 pb-2 border-b border-zinc-500/10 font-semibold text-xs text-zinc-400">
                <Briefcase className="w-4 h-4 text-rose-500" />
                <span className="text-white font-medium text-sm">Professional Profile</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Current Role</label>
                  <input
                    type="text"
                    value={userData.currentRole || ""}
                    onChange={(e) => updateField("currentRole", e.target.value)}
                    placeholder="Senior Full Stack Engineer"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Years of Experience</label>
                  <input
                    type="text"
                    value={userData.yearsOfExperience || ""}
                    onChange={(e) => updateField("yearsOfExperience", e.target.value)}
                    placeholder="5+ years"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[11px] text-zinc-400">Education Summary</label>
                  <input
                    type="text"
                    value={userData.education || ""}
                    onChange={(e) => updateField("education", e.target.value)}
                    placeholder="B.S. in Computer Science"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>

                {/* Skills */}
                <div className="space-y-1 md:col-span-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] text-zinc-400">Skills</label>
                    <button
                      onClick={addSkill}
                      className="text-rose-500 hover:text-rose-400 font-medium text-[11px]"
                    >
                      + Add skill
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {userData.skills?.map((skill, idx) => (
                      <span
                        key={idx}
                        className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs border ${
                          isDark
                            ? "bg-[#1a1a20] border-[#2c2c36] text-zinc-200"
                            : "bg-slate-100 border-slate-300 text-slate-800"
                        }`}
                      >
                        <span>{skill}</span>
                        <button
                          onClick={() => removeSkill(idx)}
                          className="text-zinc-500 hover:text-rose-400 ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {!userData.skills?.length && (
                      <span className="text-zinc-500 text-xs italic">No skills added yet</span>
                    )}
                  </div>
                </div>

                {/* URLs */}
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">LinkedIn</label>
                  <input
                    type="url"
                    value={userData.linkedin || ""}
                    onChange={(e) => updateField("linkedin", e.target.value)}
                    placeholder="https://linkedin.com/in/ayush"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">GitHub</label>
                  <input
                    type="url"
                    value={userData.github || ""}
                    onChange={(e) => updateField("github", e.target.value)}
                    placeholder="https://github.com/agayushh"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[11px] text-zinc-400">Portfolio</label>
                  <input
                    type="url"
                    value={userData.portfolio || ""}
                    onChange={(e) => updateField("portfolio", e.target.value)}
                    placeholder="https://ayush.dev"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Context Memory */}
        {activeTab === "context" && (
          <div className="space-y-6">
            <div
              className={`p-5 rounded-xl border space-y-4 ${
                isDark
                  ? "bg-[#121215] border-[#22222a]"
                  : "bg-white border-[#dcdfe4]"
              }`}
            >
              <div className="flex items-center space-x-2 pb-2 border-b border-zinc-500/10 font-semibold text-xs text-zinc-400">
                <Brain className="w-4 h-4 text-rose-500" />
                <span className="text-white font-medium text-sm">Add Context Entry</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[11px] text-zinc-400">Title</label>
                  <input
                    type="text"
                    value={newContext.title}
                    onChange={(e) => setNewContext({ ...newContext, title: e.target.value })}
                    placeholder="e.g. Distributed Cache System Project"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-zinc-400">Category</label>
                  <select
                    value={newContext.category}
                    onChange={(e) => setNewContext({ ...newContext, category: e.target.value as ContextEntry["category"] })}
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  >
                    <option value="project">Project</option>
                    <option value="experience">Experience</option>
                    <option value="leadership">Leadership</option>
                    <option value="education">Education</option>
                    <option value="certification">Certification</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="space-y-1 md:col-span-3">
                  <label className="text-[11px] text-zinc-400">Description / Key Details</label>
                  <textarea
                    rows={3}
                    value={newContext.description}
                    onChange={(e) => setNewContext({ ...newContext, description: e.target.value })}
                    placeholder="Describe what you built, problem solved, or role responsibilities..."
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[11px] text-zinc-400">Skills / Technologies (comma separated)</label>
                  <input
                    type="text"
                    value={newContext.skills}
                    onChange={(e) => setNewContext({ ...newContext, skills: e.target.value })}
                    placeholder="Go, Redis, Docker, Microservices"
                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-white border-[#cbd5e1] text-slate-900"
                    }`}
                  />
                </div>

                <div className="flex items-end md:col-span-1">
                  <button
                    onClick={addContextEntry}
                    className={`w-full py-2 px-4 rounded-lg font-medium text-xs text-white transition-all ${
                      isDark
                        ? "bg-[#e11d48] hover:bg-[#be123c]"
                        : "bg-[#e0562e] hover:bg-[#c2410c]"
                    }`}
                  >
                    Add Entry
                  </button>
                </div>
              </div>
            </div>

            {/* List of Context Entries */}
            <div className="space-y-3">
              {contextEntries.map((ctx) => (
                <div
                  key={ctx.id}
                  className={`p-4 rounded-xl border space-y-2 relative group ${
                    isDark
                      ? "bg-[#121215] border-[#22222a]"
                      : "bg-white border-[#dcdfe4]"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-zinc-500/10 text-rose-400">
                        {ctx.category}
                      </span>
                      <h4 className="font-semibold text-sm text-white mt-1">{ctx.title}</h4>
                    </div>
                    <button
                      onClick={() => deleteContextEntry(ctx.id)}
                      className="text-zinc-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{ctx.description}</p>
                </div>
              ))}
              {!contextEntries.length && (
                <div className="p-8 text-center text-zinc-500 text-xs">
                  No context entries saved yet. Add entries or import from your resume/LinkedIn above!
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Field Memory */}
        {activeTab === "learning" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs text-zinc-400">Learned form submissions across websites</span>
              {Object.keys(learnedData).length > 0 && (
                <button
                  onClick={clearAllHistory}
                  className="text-xs text-rose-500 hover:underline"
                >
                  Clear All
                </button>
              )}
            </div>

            {learnedLoading ? (
              <div className="p-8 text-center text-zinc-500 text-xs">Loading form memories...</div>
            ) : Object.keys(learnedData).length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs">No learned form fields yet.</div>
            ) : (
              Object.entries(learnedData).map(([domain, entries]) => (
                <div
                  key={domain}
                  className={`p-4 rounded-xl border space-y-2 ${
                    isDark
                      ? "bg-[#121215] border-[#22222a]"
                      : "bg-white border-[#dcdfe4]"
                  }`}
                >
                  <div className="font-semibold text-xs text-rose-400 flex items-center space-x-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    <span>{domain}</span>
                  </div>
                  <div className="space-y-1.5 pt-1">
                    {entries.map((entry, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs p-2 rounded bg-zinc-500/5"
                      >
                        <div>
                          <span className="font-medium text-white">{entry.fieldLabel}: </span>
                          <span className="text-zinc-400">{entry.value}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => mergeEntryToProfile(entry)}
                            className="text-[11px] text-emerald-400 hover:underline"
                          >
                            Save to Profile
                          </button>
                          <button
                            onClick={() => deleteLearnedEntry(domain, entry.fieldLabel)}
                            className="text-zinc-500 hover:text-rose-400"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 4: Settings */}
        {activeTab === "settings" && (
          <div
            className={`p-5 rounded-xl border space-y-4 ${
              isDark
                ? "bg-[#121215] border-[#22222a]"
                : "bg-white border-[#dcdfe4]"
            }`}
          >
            <div className="flex items-center space-x-2 pb-2 border-b border-zinc-500/10 font-semibold text-xs text-zinc-400">
              <Settings className="w-4 h-4 text-rose-500" />
              <span className="text-white font-medium text-sm">Extension Preferences</span>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <div className="font-medium text-xs text-white">Experimental On-Device Models (WASM)</div>
                <div className="text-[11px] text-zinc-400">Run local MiniLM semantic matching in browser</div>
              </div>
              <button
                onClick={async () => {
                  const next = !enableLocalModels;
                  setEnableLocalModels(next);
                  await chrome.storage.sync.set({ enableLocalModels: next });
                }}
                className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
                  enableLocalModels
                    ? isDark ? "bg-[#e11d48]" : "bg-[#e0562e]"
                    : "bg-zinc-600/30"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enableLocalModels ? "translate-x-4.5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Resume & LinkedIn Extraction Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-2xl rounded-2xl border p-6 space-y-4 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${
              isDark ? "bg-[#121215] border-[#282834] text-white" : "bg-white border-[#cbd5e1] text-slate-900"
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-500/15">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center text-white font-bold">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-sm">Import & Smart Extract from Resume or LinkedIn</h3>
              </div>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setExtractedResult(null);
                }}
                className="p-1 rounded text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Input Choice */}
              {!extractedResult ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Upload Resume, LinkedIn export, or JSON (.pdf, .txt, .json)</span>
                    <label className="text-rose-500 hover:underline cursor-pointer flex items-center space-x-1 font-medium">
                      <FileUp className="w-3.5 h-3.5" />
                      <span>Upload File</span>
                      <input
                        type="file"
                        accept=".pdf,.txt,.json,.md"
                        onChange={handleFileUploadForExtraction}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <textarea
                    rows={8}
                    value={resumeText}
                    onChange={(e) => setResumeText(e.target.value)}
                    placeholder="Paste your LinkedIn profile text, resume text, or a JSON profile export here..."
                    className={`w-full p-3 text-xs rounded-xl border font-mono focus:outline-none ${
                      isDark
                        ? "bg-[#18181b] border-[#27272a] text-white"
                        : "bg-slate-50 border-[#cbd5e1] text-slate-900"
                    }`}
                  />

                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => setIsImportModalOpen(false)}
                      className="px-4 py-2 rounded-lg text-xs font-medium bg-zinc-700/40 text-zinc-300 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleParseText}
                      disabled={!resumeText.trim()}
                      className={`px-5 py-2 rounded-lg text-xs font-semibold text-white flex items-center space-x-2 transition-all ${
                        !resumeText.trim()
                          ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                          : isDark
                            ? "bg-[#e11d48] hover:bg-[#be123c]"
                            : "bg-[#e0562e] hover:bg-[#c2410c]"
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Extract Profile & Context</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Extracted Preview */
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-500 flex items-center space-x-1">
                      <Check className="w-4 h-4" />
                      <span>Extracted {Object.keys(extractedResult.userData).length} Profile Fields & {extractedResult.contextEntries.length} Context Memories</span>
                    </span>
                    <button
                      onClick={() => setExtractedResult(null)}
                      className="text-xs text-zinc-400 hover:underline"
                    >
                      Edit Text
                    </button>
                  </div>

                  {/* Profile Fields Preview */}
                  <div className="p-3 rounded-xl bg-zinc-500/10 border border-zinc-500/20 space-y-2">
                    <h4 className="font-bold text-xs">Extracted Profile Fields:</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(extractedResult.userData).map(([k, v]) => (
                        <div key={k} className="p-1.5 rounded bg-zinc-500/10 truncate">
                          <span className="text-zinc-400 capitalize">{k}: </span>
                          <span className="font-medium text-white">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Context Entries Preview */}
                  <div className="p-3 rounded-xl bg-zinc-500/10 border border-zinc-500/20 space-y-2">
                    <h4 className="font-bold text-xs">Extracted Context Memories ({extractedResult.contextEntries.length}):</h4>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                      {extractedResult.contextEntries.map((ctx, i) => (
                        <div key={i} className="p-2 rounded bg-zinc-500/10 text-xs space-y-1">
                          <div className="font-semibold text-rose-400">{ctx.title}</div>
                          <div className="text-zinc-300 text-[11px] truncate">{ctx.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2 pt-2 border-t border-zinc-500/20">
                    <button
                      onClick={() => setExtractedResult(null)}
                      className="px-4 py-2 rounded-lg text-xs font-medium bg-zinc-700/40 text-zinc-300 hover:text-white"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleApplyExtractedData}
                      className={`px-5 py-2 rounded-lg text-xs font-semibold text-white flex items-center space-x-2 transition-all ${
                        isDark ? "bg-[#e11d48] hover:bg-[#be123c]" : "bg-[#e0562e] hover:bg-[#c2410c]"
                      }`}
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>Apply All to Profile & Storage</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
