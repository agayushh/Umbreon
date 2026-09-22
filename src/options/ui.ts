/** Shared class names for the options page (dark/light). */

export function pageClass(isDark: boolean): string {
  return `min-h-screen font-sans text-xs antialiased pb-12 transition-colors ${
    isDark ? "bg-[#09090b] text-[#fafafa]" : "bg-[#e9ecef] text-[#0f172a]"
  }`;
}

export function cardClass(isDark: boolean): string {
  return `p-5 rounded-xl border space-y-4 ${
    isDark ? "bg-[#121215] border-[#22222a]" : "bg-white border-[#dcdfe4]"
  }`;
}

export function fieldClass(isDark: boolean): string {
  return `w-full px-3 py-2 text-xs rounded-lg border focus:outline-none ${
    isDark
      ? "bg-[#18181b] border-[#27272a] text-white"
      : "bg-white border-[#cbd5e1] text-slate-900"
  }`;
}

export function ghostButtonClass(isDark: boolean): string {
  return `inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
    isDark
      ? "bg-[#18181b] border-[#27272a] text-zinc-300 hover:text-white"
      : "bg-white border-[#dcdfe4] text-slate-700 hover:text-black"
  }`;
}

export function primaryButtonClass(isDark: boolean): string {
  return `inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium text-white transition-all ${
    isDark ? "bg-[#e11d48] hover:bg-[#be123c]" : "bg-[#e0562e] hover:bg-[#c2410c]"
  }`;
}

export function iconButtonClass(isDark: boolean): string {
  return `p-1.5 rounded-md border transition-colors ${
    isDark
      ? "bg-[#18181b] border-[#27272a] text-zinc-300 hover:text-white"
      : "bg-white border-[#dcdfe4] text-slate-700 hover:text-black"
  }`;
}
