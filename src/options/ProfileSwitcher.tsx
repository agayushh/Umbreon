import { Plus, Pencil, Trash2 } from "lucide-react";
import type { NamedProfile } from "@/shared/types";

interface ProfileSwitcherProps {
  isDark: boolean;
  profiles: NamedProfile[];
  activeId: string;
  compact?: boolean;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ProfileSwitcher({
  isDark,
  profiles,
  activeId,
  compact = false,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: ProfileSwitcherProps) {
  const selectClass = `rounded-md border text-xs focus:outline-none ${
    compact ? "px-2 py-1 max-w-[140px]" : "px-2.5 py-1.5 min-w-[160px]"
  } ${
    isDark
      ? "bg-[#18181b] border-[#27272a] text-white"
      : "bg-white border-[#dcdfe4] text-slate-900"
  }`;

  const iconClass = `p-1 rounded border transition-colors ${
    isDark
      ? "bg-[#18181b] border-[#27272a] text-zinc-400 hover:text-white"
      : "bg-white border-[#dcdfe4] text-slate-600 hover:text-black"
  }`;

  return (
    <div className="flex items-center space-x-1.5">
      <select
        value={activeId}
        onChange={(e) => onSwitch(e.target.value)}
        className={selectClass}
        title="Active profile"
      >
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
          </option>
        ))}
      </select>
      <button type="button" onClick={onCreate} className={iconClass} title="New profile">
        <Plus className="w-3.5 h-3.5" />
      </button>
      {!compact && (
        <>
          <button
            type="button"
            onClick={() => onRename(activeId)}
            className={iconClass}
            title="Rename profile"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(activeId)}
            className={iconClass}
            title="Delete profile"
            disabled={profiles.length <= 1}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
