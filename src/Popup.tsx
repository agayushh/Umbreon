import { useState, useEffect } from "react";
import { isRestrictedUrl, sendToTab } from "./tabBridge";
import { mergeUserData } from "./profileStore";
import {
  Settings,
  RefreshCw,
  Zap,
  Check,
  Sun,
  Moon
} from "lucide-react";

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

interface MatchInfo {
  value: string;
  confidence: number;
  method: string;
}

interface UnfilledInfo {
  label: string;
  method: string;
  fieldIndex: number;
}

interface DetectFormsResponse {
  count: number;
  fields: FormStats["fields"];
}

interface FillFormResponse {
  success: boolean;
  message: string;
  stats?: {
    matches?: MatchInfo[];
    unfilled?: UnfilledInfo[];
    suggestedProfileUpdates?: SuggestedUpdate[];
  };
}

const methodNames: Record<string, string> = {
  synonym: "synonym match",
  fuzzy: "fuzzy match",
  semantic: "semantic match",
  context: "from context",
  template: "generated template",
  generated: "local model",
  survey: "survey answer",
  prompted: "needs input",
  none: "unfilled",
};

export default function Popup() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [formStats, setFormStats] = useState<FormStats>({
    count: 0,
    fields: [],
  });
  const [suggested, setSuggested] = useState<SuggestedUpdate[]>([]);
  const [sensitive, setSensitive] = useState<string[]>([]);
  const [learnedCount, setLearnedCount] = useState(0);
  const [surveyMode, setSurveyMode] = useState(false);
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  const [unfilled, setUnfilled] = useState<UnfilledInfo[]>([]);
  const [contextInputs, setContextInputs] = useState<Record<string, string>>(
    {},
  );
  const [pageBlocked, setPageBlocked] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    let cancelled = false;

    const initializePopup = async () => {
      try {
        const pref = await chrome.storage.sync.get(["surveyMode", "theme"]);
        if (cancelled) return;
        if (pref.surveyMode !== undefined) setSurveyMode(pref.surveyMode);
        if (pref.theme === "light" || pref.theme === "dark") {
          setTheme(pref.theme);
        }

        await detectForms();
        if (cancelled) return;

        try {
          const resp = await chrome.runtime.sendMessage({
            action: "getLearnedCount",
          });
          if (!cancelled && resp?.count) setLearnedCount(resp.count);
        } catch {
          /* background may not be ready */
        }
      } catch (error) {
        console.error("Error initializing popup:", error);
      }
    };

    initializePopup();

    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.theme) {
        setTheme(changes.theme.newValue === "light" ? "light" : "dark");
      }
    };
    chrome.storage.onChanged.addListener(listener);

    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTheme = async () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    await chrome.storage.sync.set({ theme: nextTheme });
  };

  const getActiveTab = async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab;
  };

  const detectForms = async () => {
    try {
      const tab = await getActiveTab();
      if (!tab.id) {
        setFormStats({ count: 0, fields: [] });
        return;
      }

      if (isRestrictedUrl(tab.url)) {
        setPageBlocked(true);
        setFormStats({ count: 0, fields: [] });
        setMessage(
          "Restricted page",
        );
        return;
      }

      setPageBlocked(false);

      const response = await sendToTab<DetectFormsResponse>(tab.id, {
        action: "detectForms",
      });
      setFormStats(response || { count: 0, fields: [] });
    } catch (err) {
      console.error("[FillIt] detectForms error:", err);
      setFormStats({ count: 0, fields: [] });
      setMessage(
        err instanceof Error
          ? err.message
          : "Could not connect to page",
      );
      setTimeout(() => setMessage(""), 6000);
    }
  };

  const fillForm = async () => {
    setIsLoading(true);
    setMessage("");
    setMatches([]);
    setUnfilled([]);
    setSuggested([]);
    setContextInputs({});

    try {
      const tab = await getActiveTab();
      if (!tab.id) return;

      if (isRestrictedUrl(tab.url)) {
        setMessage("Restricted page");
        return;
      }

      const response = await sendToTab<FillFormResponse>(tab.id, {
        action: "fillForm",
      });
      if (response.success) {
        setMessage(response.message);
        if (response.stats?.matches) {
          setMatches(response.stats.matches);
        }
        if (response.stats?.unfilled) {
          setUnfilled(response.stats.unfilled);
        }
        if (response.stats?.suggestedProfileUpdates) {
          setSuggested(
            response.stats.suggestedProfileUpdates as SuggestedUpdate[],
          );
        }
      } else {
        setMessage(response.message);
      }
    } catch {
      setMessage(
        "Communication error with page",
      );
    } finally {
      setIsLoading(false);
      setTimeout(() => setMessage(""), 8000);
    }
  };

  const saveLearned = async () => {
    if (suggested.length === 0) return;
    const data: Record<string, string> = {};
    suggested.forEach((s) => {
      if (!sensitive.includes(s.key)) data[s.key] = s.value;
    });
    await mergeUserData(data);
    await chrome.storage.sync.set({ sensitiveKeys: sensitive });
    setMessage("Profile updated");
    setTimeout(() => setMessage(""), 3000);
    setSuggested([]);
  };

  const toggleSurveyMode = async () => {
    const newMode = !surveyMode;
    setSurveyMode(newMode);
    await chrome.storage.sync.set({ surveyMode: newMode });
  };

  const submitContext = async (fieldLabel: string) => {
    const value = contextInputs[fieldLabel];
    if (!value?.trim()) return;

    try {
      const tab = await getActiveTab();
      const item = unfilled.find((u) => u.label === fieldLabel);
      if (item && tab.id && typeof item.fieldIndex === "number") {
        await sendToTab(tab.id, {
          action: "fillSingleField",
          data: { fieldIndex: item.fieldIndex, value: value.trim() },
        });

        setUnfilled((prev) => prev.filter((u) => u.label !== fieldLabel));
        setContextInputs((prev) => {
          const next = { ...prev };
          delete next[fieldLabel];
          return next;
        });
        setMessage(`Filled "${fieldLabel}"`);
        setTimeout(() => setMessage(""), 3000);
      }
    } catch {
      setMessage("Failed to fill field");
      setTimeout(() => setMessage(""), 4000);
    }
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const methodCounts = (): Record<string, number> => {
    const counts: Record<string, number> = {};
    matches.forEach((m) => {
      counts[m.method] = (counts[m.method] || 0) + 1;
    });
    return counts;
  };

  const filledCount = matches.filter(
    (m) => m.value && m.method !== "none" && m.method !== "prompted",
  ).length;
  const counts = methodCounts();

  const isDark = theme === "dark";

  return (
    <div
      className={`w-[340px] font-sans text-xs antialiased p-4 space-y-3 select-none ${
        isDark
          ? "bg-[#09090b] text-[#fafafa]"
          : "bg-[#e9ecef] text-[#0f172a]"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-500/10">
        <div className="flex items-center space-x-2">
          <div
            className={`w-6 h-6 rounded flex items-center justify-center font-bold text-white text-[11px] ${
              isDark ? "bg-[#e11d48]" : "bg-[#e0562e]"
            }`}
          >
            F
          </div>
          <span className="font-semibold text-sm">FillIt</span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded border transition-colors ${
              isDark
                ? "bg-[#18181b] border-[#27272a] text-zinc-300 hover:text-white"
                : "bg-white border-[#dcdfe4] text-slate-700 hover:text-black"
            }`}
          >
            {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-rose-500" />}
          </button>
          <button
            onClick={openOptions}
            className={`p-1.5 rounded border transition-colors ${
              isDark
                ? "bg-[#18181b] border-[#27272a] text-zinc-300 hover:text-white"
                : "bg-white border-[#dcdfe4] text-slate-700 hover:text-black"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Form Detection Card */}
      <div
        className={`p-3 rounded-lg border space-y-2 ${
          isDark
            ? "bg-[#121215] border-[#22222a]"
            : "bg-white border-[#dcdfe4]"
        }`}
      >
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium flex items-center space-x-1.5">
            <span className="font-semibold">{formStats.count} fields</span>
          </span>
          <button
            onClick={detectForms}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>

        {formStats.count > 0 && (
          <div className="text-[11px] text-zinc-400 space-y-0.5 pt-0.5">
            {formStats.fields.slice(0, 2).map((field, idx) => (
              <div key={idx} className="truncate">
                • {field.label || field.placeholder || field.name || "Field"}
              </div>
            ))}
            {formStats.fields.length > 2 && (
              <div className="text-[10px] text-zinc-500">
                + {formStats.fields.length - 2} more fields
              </div>
            )}
          </div>
        )}

        {formStats.count === 0 && (
          <div className="text-xs text-zinc-500 py-1">
            {pageBlocked
              ? "Browser extension disabled on this internal page."
              : "No active forms detected on page."}
          </div>
        )}
      </div>

      {/* Main Action */}
      <button
        onClick={fillForm}
        disabled={isLoading || formStats.count === 0}
        className={`w-full py-2.5 px-4 rounded-lg font-medium text-xs flex items-center justify-center space-x-2 transition-all ${
          isLoading || formStats.count === 0
            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
            : isDark
              ? "bg-[#e11d48] text-white hover:bg-[#be123c]"
              : "bg-[#e0562e] text-white hover:bg-[#c2410c]"
        }`}
      >
        {isLoading ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Filling...</span>
          </>
        ) : (
          <>
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>Fill Form</span>
          </>
        )}
      </button>

      {/* Prompted Context Input Fields */}
      {unfilled.filter((u) => u.method === "prompted").length > 0 && (
        <div
          className={`p-3 rounded-lg border space-y-2 ${
            isDark
              ? "bg-[#181215] border-[#3d1820]"
              : "bg-orange-50 border-orange-200"
          }`}
        >
          <div className="font-semibold text-xs text-rose-500">
            {unfilled.filter((u) => u.method === "prompted").length} field(s) require input
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {unfilled
              .filter((u) => u.method === "prompted")
              .map((field, i) => (
                <div key={i} className="space-y-1">
                  <div className="text-[11px] truncate text-zinc-400">{field.label}</div>
                  <div className="flex space-x-1">
                    <input
                      type="text"
                      value={contextInputs[field.label] || ""}
                      onChange={(e) =>
                        setContextInputs((prev) => ({
                          ...prev,
                          [field.label]: e.target.value,
                        }))
                      }
                      placeholder="Enter value..."
                      className={`flex-1 px-2 py-1 text-xs rounded border focus:outline-none ${
                        isDark
                          ? "bg-[#101014] border-[#2a2a34] text-white"
                          : "bg-white border-[#cbd5e1] text-slate-900"
                      }`}
                    />
                    <button
                      onClick={() => submitContext(field.label)}
                      className="px-2 py-1 bg-rose-500 text-white font-medium rounded hover:bg-rose-600"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Suggested Profile Updates Prompt */}
      {suggested.length > 0 && (
        <div
          className={`p-3 rounded-lg border space-y-2 ${
            isDark
              ? "bg-[#121215] border-[#22222a]"
              : "bg-white border-[#dcdfe4]"
          }`}
        >
          <div className="font-semibold text-xs">Save new values to profile?</div>
          <div className="space-y-1 max-h-28 overflow-y-auto text-[11px]">
            {suggested.map((s, i) => (
              <div key={i} className="flex justify-between items-center text-zinc-400">
                <span className="truncate">{s.key}: {s.value}</span>
                <label className="text-[10px] flex items-center space-x-1 cursor-pointer ml-2">
                  <input
                    type="checkbox"
                    checked={sensitive.includes(s.key)}
                    onChange={(e) => {
                      setSensitive((prev) =>
                        e.target.checked
                          ? [...prev, s.key]
                          : prev.filter((k) => k !== s.key),
                      );
                    }}
                    className="w-3 h-3 rounded"
                  />
                  <span>Sensitive</span>
                </label>
              </div>
            ))}
          </div>
          <div className="flex justify-end space-x-2 pt-1">
            <button
              onClick={() => setSuggested([])}
              className="px-2.5 py-1 text-xs rounded bg-zinc-700/40 text-zinc-300 hover:text-white"
            >
              Dismiss
            </button>
            <button
              onClick={saveLearned}
              className="px-2.5 py-1 text-xs rounded bg-rose-500 text-white font-medium hover:bg-rose-600"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Survey Toggle */}
      <div
        className={`flex items-center justify-between p-2.5 rounded-lg border ${
          isDark
            ? "bg-[#121215] border-[#22222a]"
            : "bg-white border-[#dcdfe4]"
        }`}
      >
        <span className="font-medium text-xs">Survey Mode</span>
        <button
          onClick={toggleSurveyMode}
          className={`relative inline-flex h-4 w-7 rounded-full transition-colors ${
            surveyMode
              ? isDark ? "bg-[#e11d48]" : "bg-[#e0562e]"
              : "bg-zinc-600/30"
          }`}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
              surveyMode ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Notification Toast */}
      {message && (
        <div
          className={`p-2.5 rounded-lg text-xs font-medium border flex items-center space-x-2 ${
            message.includes("Error") || message.includes("Can't") || message.includes("Failed")
              ? "bg-red-500/10 border-red-500/20 text-red-400"
              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          }`}
        >
          <span>{message}</span>
        </div>
      )}

      {/* Matches */}
      {matches.length > 0 && (
        <div
          className={`p-3 rounded-lg border space-y-1 ${
            isDark
              ? "bg-[#121215] border-[#22222a]"
              : "bg-white border-[#dcdfe4]"
          }`}
        >
          <div className="font-semibold text-emerald-500">
            Filled {filledCount} / {formStats.count} fields
          </div>
          <div className="space-y-0.5 text-zinc-400 text-[11px]">
            {Object.entries(counts).map(([method, count]) => {
              if (method === "none" || method === "prompted") return null;
              return (
                <div key={method}>
                  • {count} {methodNames[method] || method}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer link */}
      <div className="pt-1 flex items-center justify-between text-[11px] text-zinc-500">
        <span>{learnedCount} learned field{learnedCount !== 1 ? "s" : ""}</span>
        <button onClick={openOptions} className="hover:underline">
          Settings →
        </button>
      </div>
    </div>
  );
}
