/**
 * Tests for resume / LinkedIn / JSON profile import.
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { srcAliasPlugin } from "./alias-plugin.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = mkdtempSync(join(tmpdir(), "fillit-parser-"));
const outfile = join(outdir, "parser.cjs");
const wrapper = join(outdir, "entry.ts");

writeFileSync(
  wrapper,
  `
export {
  parseResumeOrLinkedInText,
  parseProfileJson,
  parseProfileObject,
  parseFetchedSource,
} from "${join(root, "src/lib/parsing/resumeParser.ts").replace(/\\/g, "/")}";
export {
  looksLikeSourceUrl,
  classifySourceUrl,
  assertImportableUrl,
} from "${join(root, "src/lib/parsing/sourceUrl.ts").replace(/\\/g, "/")}";
`,
);

await build({
  entryPoints: [wrapper],
  bundle: true,
  format: "cjs",
  platform: "node",
  outfile,
  external: ["pdfjs-dist"],
  plugins: [srcAliasPlugin(root)],
  write: true,
  logLevel: "silent",
});

const require = createRequire(import.meta.url);
const { parseResumeOrLinkedInText, parseProfileJson, parseProfileObject, parseFetchedSource } =
  require(outfile);
const { looksLikeSourceUrl, classifySourceUrl, assertImportableUrl } = require(outfile);

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

const LINKEDIN = `Ayush Goyal
Software Engineer at Acme
San Francisco, California, United States
500+ connections
Contact info

About
Full-stack engineer focused on developer tools and form automation.

Experience

Acme
Software Engineer
Jan 2021 - Present · 4 yrs 8 mos
San Francisco, California, United States
Built the applicant intake platform used by 40+ teams.
Improved form completion rates by 30%.

Education

Stanford University
Bachelor of Science - Computer Science
2016 - 2020

Skills
TypeScript · React · Node.js · Go
`;

const RESUME = `Ayush Goyal
Senior Full Stack Engineer
ayush@example.com | +1-555-0100 | linkedin.com/in/ayush | github.com/agayushh
San Francisco, CA

Skills
TypeScript, React, Node.js, PostgreSQL

Experience
Acme — Software Engineer
Led the rewrite of the hiring forms product using React and Node.js.

Education
B.S. in Computer Science, Stanford University
`;

console.log("\n--- LinkedIn paste ---");
const li = parseResumeOrLinkedInText(LINKEDIN);
console.log("  userData:", li.userData);
console.log("  skills:", li.extractedSkills);
console.log("  context:", li.contextEntries.map((c) => c.title));
check("linkedin source", li.source === "linkedin", li.source);
check("linkedin name", li.userData.name === "Ayush Goyal", li.userData.name);
check("linkedin first/last", li.userData.firstName === "Ayush" && li.userData.lastName === "Goyal");
check("linkedin role", /engineer/i.test(li.userData.currentRole || ""), li.userData.currentRole);
check("linkedin city", li.userData.city === "San Francisco", li.userData.city);
check("linkedin skills", li.extractedSkills.some((s) => /TypeScript/i.test(s)), li.extractedSkills.join(","));
check("linkedin education", /Stanford/i.test(li.userData.education || ""), li.userData.education);
check("linkedin context entries", li.contextEntries.length >= 1, String(li.contextEntries.length));

console.log("\n--- Resume paste ---");
const rv = parseResumeOrLinkedInText(RESUME);
console.log("  userData:", rv.userData);
check("resume email", rv.userData.email === "ayush@example.com", rv.userData.email);
check("resume phone", (rv.userData.phone || "").includes("555"), rv.userData.phone);
check("resume linkedin url", /linkedin\.com\/in\/ayush/i.test(rv.userData.linkedin || ""), rv.userData.linkedin);
check("resume github url", /github\.com\/agayushh/i.test(rv.userData.github || ""), rv.userData.github);
check("resume skills", (rv.userData.skills || []).some((s) => /React/i.test(s)));
check("resume role", /engineer/i.test(rv.userData.currentRole || ""), rv.userData.currentRole);

console.log("\n--- FillIt JSON backup ---");
const backup = {
  version: "1.0.0",
  userData: {
    name: "Ayush Goyal",
    email: "ayush@example.com",
    phone: "+1-555-0100",
    city: "San Francisco",
    skills: ["TypeScript", "React"],
    workType: "remote",
  },
  contextEntries: [
    {
      title: "FillIt",
      description: "Built a local-first form filler extension.",
      category: "project",
    },
  ],
  learnedData: {
    "jobs.example.com": [
      { fieldLabel: "email", value: "ayush@example.com", domain: "jobs.example.com", timestamp: 1, source: "submission" },
    ],
  },
};
const json = parseProfileJson(JSON.stringify(backup));
check("json source", json.source === "json", json.source);
check("json email", json.userData.email === "ayush@example.com");
check("json skills", (json.userData.skills || []).includes("React"));
check("json context", json.contextEntries.some((c) => c.title === "FillIt"));
check("json learned", Boolean(json.learnedData?.["jobs.example.com"]?.length));

console.log("\n--- Flat JSON aliases ---");
const flat = parseProfileObject({
  first_name: "Ayush",
  last_name: "Goyal",
  email_address: "ayush@example.com",
  phone_number: "555-0199",
  job_title: "Engineer",
  linkedin_url: "https://linkedin.com/in/ayush",
  years_of_experience: "5",
});
check("alias name assembled", flat.userData.name === "Ayush Goyal", flat.userData.name);
check("alias email", flat.userData.email === "ayush@example.com");
check("alias role", flat.userData.currentRole === "Engineer");
check("alias linkedin", /linkedin/.test(flat.userData.linkedin || ""));
check("alias years", (flat.userData.yearsOfExperience || "").includes("5"));

console.log("\n--- ALL CAPS name + HTML portfolio ---");
const caps = parseResumeOrLinkedInText(`AYUSH GOYAL
Software Engineer
ayush@caps.example
Bengaluru, Karnataka, India

WORK EXPERIENCE
Acme Labs
Software Engineer
Built hiring automation used by 20 teams.

SKILLS
Go, Rust, TypeScript
`);
check("caps name", caps.userData.name === "Ayush Goyal", caps.userData.name);
check("caps city", /Bengaluru/i.test(caps.userData.city || ""), caps.userData.city);
check("caps skills", (caps.userData.skills || []).some((s) => /TypeScript/i.test(s)));
check("caps companies", (caps.userData.previousCompanies || []).some((c) => /Acme/i.test(c)), String(caps.userData.previousCompanies));

const html = parseResumeOrLinkedInText(`
<html><body>
<h1>Ayush Goyal</h1>
<p>Senior Engineer</p>
<p>Email: ayush@port.example</p>
<section>
<h2>Projects</h2>
<h3>FillIt</h3>
<p>Local-first form filler with resume and LinkedIn import.</p>
</section>
</body></html>
`, { sourceHint: "portfolio" });
check("html name", html.userData.name === "Ayush Goyal", html.userData.name);
check("html email", html.userData.email === "ayush@port.example", html.userData.email);
check("html source", html.source === "portfolio", html.source);
check("html context", html.contextEntries.length >= 1, String(html.contextEntries.length));

console.log("\n--- JSON pasted into resume parser ---");
const pasted = parseResumeOrLinkedInText(JSON.stringify({ name: "Ada Lovelace", email: "ada@example.com" }));
check("pasted json source", pasted.source === "json");
check("pasted json name", pasted.userData.name === "Ada Lovelace");
check("pasted json email", pasted.userData.email === "ada@example.com");

console.log("\n--- URL classify + JSON-LD ---");
check("url detector", looksLikeSourceUrl("https://www.linkedin.com/in/ayush"));
check("url detector rejects text", !looksLikeSourceUrl("Ayush Goyal\nEngineer"));
check("linkedin kind", classifySourceUrl("linkedin.com/in/ayush") === "linkedin");
check("portfolio kind", classifySourceUrl("https://ayush.dev") === "portfolio");
try {
  assertImportableUrl("https://www.linkedin.com/feed/");
  check("reject linkedin feed", false);
} catch {
  check("reject linkedin feed", true);
}

const jsonLd = parseFetchedSource(
  `<html><head>
<script type="application/ld+json">
{"@type":"Person","name":"Ada Lovelace","jobTitle":"Analyst","email":"ada@example.com","url":"https://ada.dev","sameAs":["https://github.com/ada","https://linkedin.com/in/ada"],"address":{"addressLocality":"London","addressCountry":"UK"}}
</script>
<meta property="og:description" content="Mathematician and the first programmer, building calculating engines." />
</head><body><h1>Ada Lovelace</h1></body></html>`,
  { kind: "portfolio", url: "https://ada.dev" },
);
check("json-ld name", jsonLd.userData.name === "Ada Lovelace", jsonLd.userData.name);
check("json-ld role", jsonLd.userData.currentRole === "Analyst", jsonLd.userData.currentRole);
check("json-ld email", jsonLd.userData.email === "ada@example.com");
check("json-ld github", /github.com\/ada/i.test(jsonLd.userData.github || ""), jsonLd.userData.github);
check("json-ld portfolio url stored", jsonLd.userData.portfolio === "https://ada.dev", jsonLd.userData.portfolio);
check("og summary", /Mathematician/i.test(jsonLd.userData.summary || ""), jsonLd.userData.summary);

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
