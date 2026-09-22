import type { LearnedEntry } from "@/shared/types";
import { Globe, X } from "lucide-react";

interface LearningTabProps {
  isDark: boolean;
  learnedLoading: boolean;
  learnedData: Record<string, LearnedEntry[]>;
  clearAllHistory: () => void;
  mergeEntryToProfile: (entry: LearnedEntry) => void;
  deleteLearnedEntry: (domain: string, fieldLabel: string) => void;
}

export function LearningTab({
  isDark,
  learnedLoading,
  learnedData,
  clearAllHistory,
  mergeEntryToProfile,
  deleteLearnedEntry,
}: LearningTabProps) {
  return (
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
  );
}
