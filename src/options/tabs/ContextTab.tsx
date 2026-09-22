import type { ContextEntry } from "@/shared/types";
import { Brain, Trash2 } from "lucide-react";

interface ContextTabProps {
  isDark: boolean;
  newContext: {
    title: string;
    description: string;
    category: ContextEntry["category"];
    skills: string;
  };
  setNewContext: (value: ContextTabProps["newContext"]) => void;
  addContextEntry: () => void;
  contextEntries: ContextEntry[];
  deleteContextEntry: (id: string) => void;
}

export function ContextTab({
  isDark,
  newContext,
  setNewContext,
  addContextEntry,
  contextEntries,
  deleteContextEntry,
}: ContextTabProps) {
  return (
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
  );
}
