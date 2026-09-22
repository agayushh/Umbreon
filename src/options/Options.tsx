import { useState, useEffect } from "react";
import type { UserData, ContextEntry, LearnedEntry, NamedProfile } from "@/shared/types";
import { Action } from "@/shared/messages";
import { StorageKey } from "@/shared/storage";
import {
  parseResumeOrLinkedInText,
  parseImportedFile,
  parseProfileObject,
  type ExtractionResult,
} from "@/lib/parsing/resumeParser";
import {
  saveUserData as persistUserData,
  mergeUserData,
  listProfiles,
  getActiveProfile,
  setActiveProfile,
  createProfile,
  renameProfile,
  deleteProfile,
  replaceProfiles,
} from "@/lib/storage/profileStore";
import { ImportModal } from "./ImportModal";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { ContextTab } from "./tabs/ContextTab";
import { LearningTab } from "./tabs/LearningTab";
import { ProfileTab } from "./tabs/ProfileTab";
import { SettingsTab } from "./tabs/SettingsTab";
import {
  ghostButtonClass,
  iconButtonClass,
  pageClass,
  primaryButtonClass,
} from "./ui";
import {
  User,
  FileText,
  Brain,
  Settings,
  Download,
  Upload,
  Save,
  CheckCircle2,
  AlertCircle,
  Sun,
  Moon,
  Sparkles,
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
  const [profiles, setProfiles] = useState<NamedProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState("");

  const reloadActive = async () => {
    const [list, active] = await Promise.all([listProfiles(), getActiveProfile()]);
    setProfiles(list);
    setActiveProfileId(active.id);
    setUserData(active.userData || {});
    setContextEntries(active.contextEntries || []);
  };

  useEffect(() => {
    reloadActive();
    chrome.storage.sync.get([StorageKey.EnableLocalModels, StorageKey.Theme]).then((r) => {
      setEnableLocalModels(r[StorageKey.EnableLocalModels] === true);
      const themePref = r[StorageKey.Theme];
      if (themePref === "light" || themePref === "dark") {
        setTheme(themePref);
      }
    });

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[StorageKey.Theme]) {
        setTheme(changes[StorageKey.Theme].newValue === "light" ? "light" : "dark");
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
    await chrome.storage.sync.set({ [StorageKey.Theme]: nextTheme });
  };

  const loadUserData = async () => {
    try {
      await reloadActive();
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  const saveUserData = async () => {
    setIsLoading(true);
    try {
      await persistUserData(userData);
      await reloadActive();
      setMessage("Profile saved");
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Failed to save profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchProfile = async (id: string) => {
    try {
      await persistUserData(userData);
      await setActiveProfile(id);
      await reloadActive();
    } catch (error) {
      console.error("Error switching profile:", error);
    }
  };

  const handleCreateProfile = async () => {
    const name = prompt("Name this profile:", "New profile");
    if (name === null) return;
    try {
      await persistUserData(userData);
      await createProfile(name.trim() || "New profile");
      await reloadActive();
      setMessage("New profile created");
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Failed to create profile");
    }
  };

  const handleRenameProfile = async (id: string) => {
    const current = profiles.find((p) => p.id === id);
    const name = prompt("Rename profile:", current?.name || "");
    if (!name?.trim()) return;
    await renameProfile(id, name);
    await reloadActive();
  };

  const handleDeleteProfile = async (id: string) => {
    if (profiles.length <= 1) return;
    if (!confirm("Delete this profile? This cannot be undone.")) return;
    await deleteProfile(id);
    await reloadActive();
    setMessage("Profile deleted");
    setTimeout(() => setMessage(""), 3000);
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
        chrome.runtime.sendMessage({ action: Action.GetContextEntries }),
        chrome.runtime.sendMessage({ action: Action.GetLearnedData }),
      ]);
      const entries = contextResp?.data || contextEntries || [];
      const learned = learnedResp?.data || learnedData || {};
      const backupData = {
        version: "1.1.0",
        exportedAt: new Date().toISOString(),
        userData,
        contextEntries: entries,
        learnedData: learned,
        profiles,
        activeProfileId,
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
    if (parsed.profiles?.length) {
      await replaceProfiles(parsed.profiles, parsed.activeProfileId);
      await reloadActive();
    } else if (Object.keys(parsed.userData).length > 0 || parsed.extractedSkills.length > 0) {
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
          action: Action.SaveContextEntry,
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
        action: Action.ImportLearnedData,
        data: parsed.learnedData,
      });
    }

    await reloadActive();
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
            : result.source === "portfolio"
              ? "Portfolio"
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
        action: Action.GetContextEntries,
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
        action: Action.SaveContextEntry,
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
        action: Action.DeleteContextEntry,
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
        action: Action.GetLearnedData,
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
        action: Action.DeleteLearnedEntry,
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
      await chrome.runtime.sendMessage({ action: Action.ClearLearnedHistory });
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
        action: Action.MergeLearnedToProfile,
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
    <div className={pageClass(isDark)}>
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
            <ProfileSwitcher
              isDark={isDark}
              profiles={profiles}
              activeId={activeProfileId}
              onSwitch={handleSwitchProfile}
              onCreate={handleCreateProfile}
              onRename={handleRenameProfile}
              onDelete={handleDeleteProfile}
            />
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleTheme}
              className={iconButtonClass(isDark)}
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
              <span>Import Resume / LinkedIn / Portfolio</span>
            </button>

            <button
              onClick={exportFullData}
              className={ghostButtonClass(isDark)}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>

            <label
              className={`${ghostButtonClass(isDark)} cursor-pointer`}
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
              className={primaryButtonClass(isDark)}
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

        {activeTab === "profile" && (
          <ProfileTab
            isDark={isDark}
            userData={userData}
            updateField={updateField}
            addSkill={addSkill}
            removeSkill={removeSkill}
          />
        )}

        {activeTab === "context" && (
          <ContextTab
            isDark={isDark}
            newContext={newContext}
            setNewContext={setNewContext}
            addContextEntry={addContextEntry}
            contextEntries={contextEntries}
            deleteContextEntry={deleteContextEntry}
          />
        )}

        {activeTab === "learning" && (
          <LearningTab
            isDark={isDark}
            learnedLoading={learnedLoading}
            learnedData={learnedData}
            clearAllHistory={clearAllHistory}
            mergeEntryToProfile={mergeEntryToProfile}
            deleteLearnedEntry={deleteLearnedEntry}
          />
        )}

        {activeTab === "settings" && (
          <SettingsTab
            isDark={isDark}
            enableLocalModels={enableLocalModels}
            onToggleLocalModels={async () => {
              const next = !enableLocalModels;
              setEnableLocalModels(next);
              await chrome.storage.sync.set({ [StorageKey.EnableLocalModels]: next });
            }}
          />
        )}
      </main>

      {isImportModalOpen && (
        <ImportModal
          isDark={isDark}
          resumeText={resumeText}
          extractedResult={extractedResult}
          onClose={() => {
            setIsImportModalOpen(false);
            setExtractedResult(null);
          }}
          onResumeTextChange={setResumeText}
          onParseText={handleParseText}
          onFileUpload={handleFileUploadForExtraction}
          onApply={handleApplyExtractedData}
          onClearResult={() => setExtractedResult(null)}
        />
      )}
    </div>
  );
}
