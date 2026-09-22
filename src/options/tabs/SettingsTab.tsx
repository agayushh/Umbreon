import { Settings } from "lucide-react";

interface SettingsTabProps {
  isDark: boolean;
  enableLocalModels: boolean;
  onToggleLocalModels: () => void;
}

export function SettingsTab({
  isDark,
  enableLocalModels,
  onToggleLocalModels,
}: SettingsTabProps) {
  return (
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
          onClick={onToggleLocalModels}
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
  );
}
