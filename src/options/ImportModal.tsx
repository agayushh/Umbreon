import type { ChangeEvent } from "react";
import type { ExtractionResult } from "@/lib/parsing/resumeParser";
import { Sparkles, FileUp, Check, Save, X, Link as LinkIcon } from "lucide-react";

interface ImportModalProps {
  isDark: boolean;
  sourceUrl: string;
  resumeText: string;
  extractedResult: ExtractionResult | null;
  fetching: boolean;
  onClose: () => void;
  onSourceUrlChange: (value: string) => void;
  onResumeTextChange: (value: string) => void;
  onFetchUrl: () => void;
  onParseText: () => void;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onApply: () => void;
  onClearResult: () => void;
}

export function ImportModal({
  isDark,
  sourceUrl,
  resumeText,
  extractedResult,
  fetching,
  onClose,
  onSourceUrlChange,
  onResumeTextChange,
  onFetchUrl,
  onParseText,
  onFileUpload,
  onApply,
  onClearResult,
}: ImportModalProps) {
  const canFetch = Boolean(sourceUrl.trim()) && !fetching;
  const canParse = Boolean(resumeText.trim()) && !fetching;

  return (
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
            <h3 className="font-bold text-sm">Import from a link, JSON, Markdown, or HTML</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {!extractedResult ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-zinc-400">LinkedIn profile or portfolio URL</label>
                <div className="flex space-x-2">
                  <div className="relative flex-1">
                    <LinkIcon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="url"
                      value={sourceUrl}
                      onChange={(e) => onSourceUrlChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && canFetch) onFetchUrl();
                      }}
                      placeholder="https://linkedin.com/in/you  or  https://you.dev"
                      className={`w-full pl-8 pr-3 py-2.5 text-xs rounded-xl border focus:outline-none ${
                        isDark
                          ? "bg-[#18181b] border-[#27272a] text-white"
                          : "bg-slate-50 border-[#cbd5e1] text-slate-900"
                      }`}
                    />
                  </div>
                  <button
                    onClick={onFetchUrl}
                    disabled={!canFetch}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold text-white flex items-center space-x-2 ${
                      !canFetch
                        ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                        : isDark
                          ? "bg-[#e11d48] hover:bg-[#be123c]"
                          : "bg-[#e0562e] hover:bg-[#c2410c]"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{fetching ? "Fetching..." : "Fetch"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  LinkedIn uses the profile tab in your browser (stay signed in). Portfolio sites are fetched directly.
                </p>
              </div>

              <div className="flex items-center space-x-3 text-[11px] text-zinc-500">
                <div className="flex-1 h-px bg-zinc-500/20" />
                <span>or drop JSON / Markdown / HTML</span>
                <div className="flex-1 h-px bg-zinc-500/20" />
              </div>

              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Accepts .json, .md, .html</span>
                <label className="text-rose-500 hover:underline cursor-pointer flex items-center space-x-1 font-medium">
                  <FileUp className="w-3.5 h-3.5" />
                  <span>Upload File</span>
                  <input
                    type="file"
                    accept=".json,.md,.markdown,.html,.htm,application/json,text/markdown,text/html"
                    onChange={onFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <textarea
                rows={6}
                value={resumeText}
                onChange={(e) => onResumeTextChange(e.target.value)}
                placeholder="Paste JSON, Markdown, or HTML..."
                className={`w-full p-3 text-xs rounded-xl border font-mono focus:outline-none ${
                  isDark
                    ? "bg-[#18181b] border-[#27272a] text-white"
                    : "bg-slate-50 border-[#cbd5e1] text-slate-900"
                }`}
              />

              <div className="flex justify-end space-x-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-zinc-700/40 text-zinc-300 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={onParseText}
                  disabled={!canParse}
                  className={`px-5 py-2 rounded-lg text-xs font-semibold text-white flex items-center space-x-2 transition-all ${
                    !canParse
                      ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                      : isDark
                        ? "bg-[#e11d48] hover:bg-[#be123c]"
                        : "bg-[#e0562e] hover:bg-[#c2410c]"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Extract</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-500 flex items-center space-x-1">
                  <Check className="w-4 h-4" />
                  <span>
                    Extracted {Object.keys(extractedResult.userData).length} profile fields &{" "}
                    {extractedResult.contextEntries.length} context memories
                  </span>
                </span>
                <button onClick={onClearResult} className="text-xs text-zinc-400 hover:underline">
                  Back
                </button>
              </div>

              <div className="p-3 rounded-xl bg-zinc-500/10 border border-zinc-500/20 space-y-2">
                <h4 className="font-bold text-xs">Extracted profile fields</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(extractedResult.userData).map(([k, v]) => (
                    <div key={k} className="p-1.5 rounded bg-zinc-500/10 truncate">
                      <span className="text-zinc-400 capitalize">{k}: </span>
                      <span className="font-medium">
                        {Array.isArray(v) ? v.join(", ") : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-zinc-500/10 border border-zinc-500/20 space-y-2">
                <h4 className="font-bold text-xs">
                  Extracted context memories ({extractedResult.contextEntries.length})
                </h4>
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
                  onClick={onClearResult}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-zinc-700/40 text-zinc-300 hover:text-white"
                >
                  Back
                </button>
                <button
                  onClick={onApply}
                  className={`px-5 py-2 rounded-lg text-xs font-semibold text-white flex items-center space-x-2 transition-all ${
                    isDark ? "bg-[#e11d48] hover:bg-[#be123c]" : "bg-[#e0562e] hover:bg-[#c2410c]"
                  }`}
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Apply to active profile</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
