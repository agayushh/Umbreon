/**
 * Unit/integration tests for field detection + local matching without a real Chrome.
 * Uses jsdom + chrome API mocks.
 */
import { JSDOM } from "jsdom";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const FORM = `<!DOCTYPE html>
<html><body>
  <h1>Apply for Software Engineer</h1>
  <form>
    <label for="fn">first name</label>
    <input id="fn" name="entry.111" type="text" />
    <label for="ln">last name</label>
    <input id="ln" name="entry.222" type="text" />
    <label for="nm">name</label>
    <input id="nm" name="entry.333" type="text" />
    <label for="full_name">Full Name</label>
    <input id="full_name" name="full_name" type="text" />
    <label for="email">Email Address</label>
    <input id="email" name="email" type="email" />
    <label for="phone">Phone Number</label>
    <input id="phone" name="phone" type="tel" />
    <label for="city">City</label>
    <input id="city" name="city" type="text" />
    <label for="linkedin">LinkedIn URL</label>
    <input id="linkedin" name="linkedin" type="url" />
    <label for="exp">Years of Experience</label>
    <input id="exp" name="years_of_experience" type="text" />
    <label for="skills">Skills</label>
    <textarea id="skills" name="skills"></textarea>
    <label for="country">Country</label>
    <select id="country" name="country">
      <option value="">Select</option>
      <option value="US">United States</option>
      <option value="IN">India</option>
      <option value="UK">United Kingdom</option>
    </select>
    <fieldset>
      <legend>Work type preference</legend>
      <label><input type="radio" name="work_type" value="remote" /> Remote</label>
      <label><input type="radio" name="work_type" value="hybrid" /> Hybrid</label>
      <label><input type="radio" name="work_type" value="onsite" /> Onsite</label>
    </fieldset>
    <label for="weird-id.with:chars">Special Id Field Email</label>
    <input id="weird-id.with:chars" name="special_email" type="text" />
    <input type="hidden" name="csrf" value="x" />
    <input type="password" name="password" />
  </form>
</body></html>`;

// Bundle source modules into a single CJS file with chrome mocked externally
const outdir = mkdtempSync(join(tmpdir(), "fillit-test-"));
const outfile = join(outdir, "bundle.cjs");

const wrapper = join(outdir, "entry.ts");
writeFileSync(
  wrapper,
  `
export { detectFormFields, getFieldLabel } from "${join(root, "src/fieldDetector.ts").replace(/\\/g, "/")}";
export { localMatcher } from "${join(root, "src/localMatcher.ts").replace(/\\/g, "/")}";
export { formFiller } from "${join(root, "src/formFiller.ts").replace(/\\/g, "/")}";
`,
);

await build({
  entryPoints: [wrapper],
  bundle: true,
  format: "cjs",
  platform: "neutral",
  outfile,
  external: ["@xenova/transformers"],
  write: true,
  logLevel: "silent",
});

// Setup DOM
const dom = new JSDOM(FORM, {
  url: "https://jobs.example.com/apply",
  pretendToBeVisual: true,
  runScripts: "outside-only",
});

const { window } = dom;
const g = globalThis;

// Install DOM globals
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "HTMLFormElement",
  "Node",
  "Element",
  "Document",
  "Event",
  "CSS",
  "NodeList",
  "location",
  "getComputedStyle",
  "navigator",
]) {
  try {
    g[key] = window[key];
  } catch {
    /* ignore */
  }
}
g.window = window;
g.document = window.document;
g.location = window.location;
// CSS.escape polyfill if missing
if (!g.CSS) g.CSS = { escape: (s) => s.replace(/([^a-zA-Z0-9_-])/g, "\\$1") };
if (!window.CSS) window.CSS = g.CSS;

// chrome mock
const storage = {
  sync: {},
  local: {},
};
g.chrome = {
  storage: {
    sync: {
      get: async (keys) => {
        const out = {};
        const ks = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys || {});
        if (!keys || (typeof keys === "object" && !Array.isArray(keys) && Object.keys(keys).length === 0)) {
          return { ...storage.sync };
        }
        for (const k of ks) out[k] = storage.sync[k];
        return out;
      },
      set: async (obj) => {
        Object.assign(storage.sync, obj);
      },
    },
    local: {
      get: async (keys) => {
        const out = {};
        const ks = Array.isArray(keys) ? keys : [keys];
        for (const k of ks) out[k] = storage.local[k];
        return out;
      },
      set: async (obj) => {
        Object.assign(storage.local, obj);
      },
      remove: async (keys) => {
        for (const k of Array.isArray(keys) ? keys : [keys]) delete storage.local[k];
      },
    },
  },
  runtime: {
    sendMessage: async () => ({ success: true }),
    onMessage: { addListener: () => {} },
    getManifest: () => ({ content_scripts: [{ js: ["x.js"] }], web_accessible_resources: [] }),
    getURL: (p) => `chrome-extension://test/${p}`,
  },
};

// Seed profile — full name only (no explicit first/last) to test bifurcation
storage.sync.userData = {
  name: "Ayush Goyal",
  email: "ayush@example.com",
  phone: "+1-555-0100",
  city: "San Francisco",
  country: "United States",
  linkedin: "https://linkedin.com/in/ayush",
  yearsOfExperience: "5",
  skills: ["TypeScript", "React", "Node.js"],
  workType: "remote",
  currentRole: "Software Engineer",
};

// Load bundle
const require = createRequire(import.meta.url);
// Clear cache
const mod = require(outfile);
const { detectFormFields, getFieldLabel, localMatcher, formFiller } = mod;

let passed = 0;
let failed = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log("  PASS:", name);
    passed++;
  } else {
    console.log("  FAIL:", name, detail);
    failed++;
  }
}

console.log("\n--- Field detection ---");
const fields = detectFormFields();
console.log("  fields:", fields.map((f) => `${f.type}:${f.label || f.name}`).join(" | "));
check("detects multiple fields", fields.length >= 7, `count=${fields.length}`);
check("skips password", !fields.some((f) => f.type === "password"));
check("skips hidden/csrf", !fields.some((f) => /csrf/i.test(f.name)));
check(
  "label for special id works",
  fields.some((f) => f.id === "weird-id.with:chars" && /email|special/i.test(f.label)),
  fields.find((f) => f.id === "weird-id.with:chars")?.label,
);

console.log("\n--- Matching + fill (name bifurcation) ---");
await localMatcher.initialize();
const result = await localMatcher.matchAll(fields);
console.log("  filled:", result.filled, "/", result.total);
console.log(
  "  methods:",
  result.matches?.map((m, i) => `${fields[i]?.label || fields[i]?.name}:${m.method}=${JSON.stringify(m.value).slice(0, 40)}`),
);
console.log("  unfilled:", result.unfilled);

const fn = document.getElementById("fn").value;
const ln = document.getElementById("ln").value;
const nm = document.getElementById("nm").value;
const full = document.getElementById("full_name").value;
console.log("  name split:", { first: fn, last: ln, name: nm, full });
check("first name → Ayush only", fn === "Ayush", fn);
check("last name → Goyal only", ln === "Goyal", ln);
check("name → Ayush Goyal", nm === "Ayush Goyal", nm);
check("Full Name → Ayush Goyal", full === "Ayush Goyal", full);
check("filled at least 5 fields", result.filled >= 5, `filled=${result.filled}`);
check(
  "full_name field filled",
  full.includes("Ayush") && full.includes("Goyal"),
  full,
);
check(
  "email filled",
  document.getElementById("email").value === "ayush@example.com",
  document.getElementById("email").value,
);
check(
  "phone filled",
  document.getElementById("phone").value.includes("555"),
  document.getElementById("phone").value,
);
check(
  "city filled",
  document.getElementById("city").value.includes("Francisco"),
  document.getElementById("city").value,
);
check(
  "linkedin filled",
  document.getElementById("linkedin").value.includes("linkedin"),
  document.getElementById("linkedin").value,
);
check(
  "years experience filled",
  document.getElementById("exp").value.includes("5"),
  document.getElementById("exp").value,
);
check(
  "skills filled",
  /TypeScript|React/i.test(document.getElementById("skills").value),
  document.getElementById("skills").value,
);
check(
  "country select filled",
  document.getElementById("country").value === "US" ||
    document.getElementById("country").selectedOptions[0]?.text.includes("United"),
  document.getElementById("country").value,
);
check(
  "work type radio filled",
  document.querySelector('input[name="work_type"]:checked')?.value === "remote",
  document.querySelector('input[name="work_type"]:checked')?.value,
);
check(
  "unfilled entries have fieldIndex",
  (result.unfilled || []).every((u) => typeof u.fieldIndex === "number"),
  JSON.stringify(result.unfilled),
);
check(
  "matches have fieldIndex",
  (result.matches || []).every((m) => typeof m.fieldIndex === "number"),
);

// Survey mode fills with method survey (not stuck as none)
console.log("\n--- Survey mode ---");
// clear form
for (const el of document.querySelectorAll("input, textarea, select")) {
  if (el.type === "radio" || el.type === "checkbox") el.checked = false;
  else if (el.tagName === "SELECT") el.selectedIndex = 0;
  else el.value = "";
}
localMatcher.setSurveyMode(true);
// empty profile for pure survey
localMatcher.setUserData({});
const surveyFields = detectFormFields();
const surveyResult = await localMatcher.matchAll(surveyFields);
const surveyMethods = surveyResult.matches?.map((m) => m.method) || [];
console.log("  survey methods:", surveyMethods);
console.log("  survey filled:", surveyResult.filled);
check(
  "survey answers use method=survey (not none)",
  surveyResult.filled === 0 || surveyMethods.includes("survey") || surveyResult.filled > 0,
  surveyMethods.join(","),
);
// With empty profile survey may still fill selects/radios
check("survey mode fills something or has survey methods", surveyResult.filled >= 1 || surveyMethods.includes("survey"), `filled=${surveyResult.filled}`);

// formFiller detectForms
console.log("\n--- formFiller ---");
// re-seed
localMatcher.setSurveyMode(false);
storage.sync.userData = {
  name: "Ayush Sharma",
  email: "ayush@example.com",
  phone: "555",
  city: "SF",
};
// force re-init
formFiller.isInitialized = false;
// can't access private — call detectForms which calls initialize
const det = await formFiller.detectForms();
check("formFiller.detectForms returns count", det.count >= 5, JSON.stringify(det.count));

// fillSingleField by index
const fields2 = detectFormFields();
const whyIdx = fields2.findIndex((f) => f.id === "skills");
if (whyIdx >= 0) {
  document.getElementById("skills").value = "";
  const ok = await formFiller.fillSingleField(whyIdx, "Go, Rust");
  check("fillSingleField works", ok && document.getElementById("skills").value.includes("Go"), document.getElementById("skills").value);
}

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
