import { useState, useEffect } from "react";
import { isRestrictedUrl, sendToTab } from "./tabBridge";

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

interface FormContext {
  type: string;
  domain: string;
  pageTitle: string;
  confidence: number;
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
  prompted: "needs your input",
  none: "couldn't fill",
};

export default function Popup() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [formStats, setFormStats] = useState<FormStats>({
    count: 0,
    fields: [],
  });
  const [formContext] = useState<FormContext | null>(null);
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

  useEffect(() => {
    let cancelled = false;

    const initializePopup = async () => {
      try {
        const pref = await chrome.storage.sync.get(["surveyMode"]);
        if (cancelled) return;
        if (pref.surveyMode !== undefined) setSurveyMode(pref.surveyMode);

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
    return () => {
      cancelled = true;
    };
    // Mount-only init: detectForms is stable for first open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          "This page can't run extensions (browser internal / Web Store). Open a normal website.",
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
          : "Could not reach this page. Refresh and try again.",
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
        setMessage("Can't fill forms on this page.");
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
        "Error: Could not communicate with the page. Refresh and try again.",
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
    await chrome.storage.sync.set({
      userData: {
        ...(await chrome.storage.sync.get(["userData"])).userData,
        ...data,
      },
    });
    await chrome.storage.sync.set({ sensitiveKeys: sensitive });
    setMessage("Saved new profile data");
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
        setMessage(`Filled "${fieldLabel}" with your input`);
        setTimeout(() => setMessage(""), 3000);
      }
    } catch {
      setMessage(
        "Failed to fill field. Try clicking on the field and typing manually.",
      );
      setTimeout(() => setMessage(""), 4000);
    }
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const contextTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      "job-application": "🎯 Job Application",
      registration: "📝 Registration",
      survey: "📊 Survey",
      checkout: "💳 Checkout",
      government: "🏛️ Government Form",
      contact: "📧 Contact Form",
      login: "🔐 Login",
      feedback: "💬 Feedback",
      generic: "📋 Form",
    };
    return labels[type] || "📋 Form";
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

  return (
    <div className="p-4 w-80 bg-gray-50 min-h-[400px]">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold text-gray-800">FillIt</h1>
        <button
          onClick={openOptions}
          className="text-gray-500 hover:text-gray-700 text-sm"
          title="Open settings"
        >
          ⚙️
        </button>
      </div>

      <div className="mb-3 text-xs text-gray-500 bg-gray-100 p-2 rounded flex items-center">
        <span className="mr-1">🔒</span>
        Data stays in your browser — nothing is ever uploaded.
      </div>

      <div className="mb-3 p-3 bg-blue-50 rounded">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-blue-800">
            {contextTypeLabel(formContext?.type || "generic")} ·{" "}
            {formStats.count} fields
          </span>
          <button
            onClick={detectForms}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            🔄 Refresh
          </button>
        </div>
        {formStats.count > 0 && (
          <div className="mt-2 text-xs text-blue-600">
            {formStats.fields.slice(0, 3).map((field, index) => (
              <div key={index} className="truncate">
                {field.label ||
                  field.placeholder ||
                  field.name ||
                  "Unnamed field"}
              </div>
            ))}
            {formStats.fields.length > 3 && (
              <div>... and {formStats.fields.length - 3} more</div>
            )}
          </div>
        )}
        {formStats.count === 0 && (
          <div className="mt-1 text-xs text-blue-500">
            {pageBlocked
              ? "Extensions can't run on this page"
              : "No forms detected on this page"}
          </div>
        )}
      </div>

      <button
        onClick={fillForm}
        disabled={isLoading || formStats.count === 0}
        className={`w-full p-3 rounded font-medium ${
          isLoading || formStats.count === 0
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-blue-500 text-white hover:bg-blue-600"
        }`}
      >
        {isLoading ? "Filling..." : "Fill Form"}
      </button>

      <div className="mt-2 flex items-center justify-between p-2 bg-white rounded border border-gray-200">
        <div>
          <span className="text-xs font-medium text-gray-700">Survey Mode</span>
          <div className="text-xs text-gray-400">Random answers for surveys</div>
        </div>
        <button
          onClick={toggleSurveyMode}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            surveyMode ? "bg-green-500" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              surveyMode ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {message && (
        <div
          className={`mt-3 p-2 rounded text-sm ${
            message.includes("Error") ||
            message.includes("❌") ||
            message.includes("can't") ||
            message.includes("Can't") ||
            message.includes("failed") ||
            message.includes("Could not")
              ? "bg-red-100 text-red-800"
              : "bg-green-100 text-green-800"
          }`}
        >
          {message}
        </div>
      )}

      {matches.length > 0 && (
        <div className="mt-3 p-3 bg-white rounded border border-gray-200">
          <div className="text-sm font-medium text-gray-800 mb-2">
            ✅ Filled {filledCount}/{formStats.count} fields
          </div>
          <div className="space-y-1 text-xs text-gray-600">
            {Object.entries(counts).map(([method, count]) => {
              if (method === "none" || method === "prompted") return null;
              return (
                <div key={method}>
                  · {count} {methodNames[method] || method}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {unfilled.filter((u) => u.method === "prompted").length > 0 && (
        <div className="mt-3 p-3 bg-yellow-50 rounded border border-yellow-200">
          <div className="text-sm font-medium text-yellow-800 mb-2">
            ⚠️ {unfilled.filter((u) => u.method === "prompted").length} field
            {unfilled.filter((u) => u.method === "prompted").length > 1
              ? "s"
              : ""}{" "}
            need your context
          </div>
          <div className="space-y-2 max-h-48 overflow-auto">
            {unfilled
              .filter((u) => u.method === "prompted")
              .map((field, i) => (
                <div key={i} className="space-y-1">
                  <div className="text-xs text-yellow-700 truncate">
                    {field.label}
                  </div>
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
                      placeholder="Quick answer..."
                      className="flex-1 p-1 text-xs border border-gray-300 rounded"
                    />
                    <button
                      onClick={() => submitContext(field.label)}
                      className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                    >
                      ✓
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {suggested.length > 0 && (
        <div className="mt-3 p-3 border rounded bg-white">
          <div className="text-sm font-medium text-gray-800 mb-2">
            Save new data to your profile?
          </div>
          <div className="space-y-2 max-h-40 overflow-auto">
            {suggested.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm"
              >
                <div className="truncate">
                  <span className="font-semibold">{s.key}:</span> {s.value}
                </div>
                <label className="ml-2 text-xs text-gray-600 flex items-center">
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
                    className="mr-1"
                  />
                  Sensitive
                </label>
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-2 space-x-2">
            <button
              onClick={() => setSuggested([])}
              className="text-sm px-3 py-1 bg-gray-200 rounded"
            >
              Dismiss
            </button>
            <button
              onClick={saveLearned}
              className="text-sm px-3 py-1 bg-blue-600 text-white rounded"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 text-xs text-gray-500 space-y-1">
        {learnedCount > 0 && (
          <div>
            🧠 Learned from {learnedCount} form field
            {learnedCount !== 1 ? "s" : ""}
          </div>
        )}
        <div>💡 Set up your profile & context in ⚙️ for best results</div>
      </div>
    </div>
  );
}
