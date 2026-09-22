import type { UserData } from "@/shared/types";
import { User, MapPin, Briefcase, X } from "lucide-react";

interface ProfileTabProps {
  isDark: boolean;
  userData: UserData;
  updateField: (field: keyof UserData, value: string | boolean | string[]) => void;
  addSkill: () => void;
  removeSkill: (index: number) => void;
}

export function ProfileTab({
  isDark,
  userData,
  updateField,
  addSkill,
  removeSkill,
}: ProfileTabProps) {
  return (
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
  );
}
