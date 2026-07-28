/**
 * Headless Chrome test for FillIt extension.
 * Loads dist/, seeds profile, opens a local form, injects content script, fills, asserts.
 */
import puppeteer from "puppeteer";
import { createServer } from "node:http";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const dist = join(root, "dist");

const FORM_HTML = `<!DOCTYPE html>
<html><head><title>Job Application Test Form</title></head>
<body>
  <h1>Apply for Software Engineer</h1>
  <form id="app">
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

    <button type="submit">Submit</button>
  </form>
</body></html>`;

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(FORM_HTML);
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/form.html` });
    });
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
}

const userDataDir = mkdtempSync(join(tmpdir(), "fillit-chrome-"));

const { server, url: formUrl } = await startServer();
console.log("Form URL:", formUrl);
console.log("Extension:", dist);

let browser;
const results = { passed: [], failed: [] };

try {
  browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    userDataDir,
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
    ],
  });

  // Wait for service worker / extension id
  await new Promise((r) => setTimeout(r, 1500));

  const targets = await browser.targets();
  const extTarget = targets.find(
    (t) =>
      t.type() === "service_worker" &&
      t.url().startsWith("chrome-extension://"),
  );
  assert(extTarget, "Extension service worker not found — load failed?");
  const extUrl = extTarget.url();
  const extensionId = new URL(extUrl).host;
  console.log("Extension ID:", extensionId);
  results.passed.push("extension loads with service worker");

  // Seed profile via extension page context
  const bg = await extTarget.worker();
  if (bg) {
    await bg.evaluate(async () => {
      await chrome.storage.sync.set({
        userData: {
          name: "Ayush Sharma",
          email: "ayush@example.com",
          phone: "+1-555-0100",
          city: "San Francisco",
          country: "United States",
          linkedin: "https://linkedin.com/in/ayush",
          yearsOfExperience: "5",
          skills: ["TypeScript", "React", "Node.js"],
          workType: "remote",
          currentRole: "Software Engineer",
        },
        surveyMode: false,
      });
    });
    results.passed.push("profile seeded in chrome.storage.sync");
  } else {
    // Fallback: open extension options and set storage
    const page = await browser.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);
    await page.evaluate(async () => {
      await chrome.storage.sync.set({
        userData: {
          name: "Ayush Sharma",
          email: "ayush@example.com",
          phone: "+1-555-0100",
          city: "San Francisco",
          country: "United States",
          linkedin: "https://linkedin.com/in/ayush",
          yearsOfExperience: "5",
          skills: ["TypeScript", "React", "Node.js"],
          workType: "remote",
        },
      });
    });
    await page.close();
    results.passed.push("profile seeded via options page");
  }

  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("PAGE ERR:", msg.text());
  });

  await page.goto(formUrl, { waitUntil: "networkidle0" });

  // Resolve content script module from extension manifest WAR
  const modulePath = await page.evaluate(async (id) => {
    const manifest = await fetch(`chrome-extension://${id}/manifest.json`).then(
      (r) => r.json(),
    );
    const resources =
      manifest.web_accessible_resources?.flatMap((e) => e.resources || []) ||
      [];
    return (
      resources.find((r) => /content\.ts-/.test(r) && !r.includes("loader")) ||
      null
    );
  }, extensionId);

  // Manifest fetch from page may be blocked — inject via CDP instead
  const client = await page.createCDPSession();

  // Prefer chrome.scripting from extension SW
  if (bg) {
    const tabId = await (async () => {
      // get tab id via targets
      const t = page.target();
      // puppeteer doesn't expose chrome tab id easily — inject via page evaluate of import
      return null;
    })();
    void tabId;
  }

  // Inject content module using page's ability to load extension WAR scripts
  // Use executeScript through extension background
  const injectResult = await (async () => {
    if (!bg) return { ok: false, reason: "no sw" };
    // Get chrome tab id
    const tabInfo = await bg.evaluate(async (u) => {
      const tabs = await chrome.tabs.query({ url: u.split("?")[0] + "*" });
      // exact match
      const all = await chrome.tabs.query({});
      const tab = all.find((t) => t.url && t.url.includes("127.0.0.1"));
      return tab?.id ?? null;
    }, formUrl);

    if (!tabInfo) return { ok: false, reason: "tab not found" };

    const man = await bg.evaluate(() => chrome.runtime.getManifest());
    const war = man.web_accessible_resources || [];
    let moduleUrl = null;
    for (const entry of war) {
      for (const res of entry.resources || []) {
        if (/content\.ts-/.test(res) && !res.includes("loader")) {
          moduleUrl = chrome.runtime.getURL
            ? null
            : res;
          // getURL only in extension context
        }
      }
    }
    const contentModule = await bg.evaluate(() => {
      const man = chrome.runtime.getManifest();
      for (const entry of man.web_accessible_resources || []) {
        for (const res of entry.resources || []) {
          if (/content\.ts-/.test(res) && !res.includes("loader")) {
            return chrome.runtime.getURL(res);
          }
        }
      }
      // fallback: loader files
      return man.content_scripts?.[0]?.js?.[0]
        ? chrome.runtime.getURL(man.content_scripts[0].js[0])
        : null;
    });

    assert(contentModule, "Could not resolve content module URL");

    // Inject by awaiting dynamic import
    await bg.evaluate(
      async (tabId, moduleUrl) => {
        await chrome.scripting.executeScript({
          target: { tabId },
          world: "ISOLATED",
          func: async (url) => {
            await import(url);
          },
          args: [moduleUrl],
        });
      },
      tabInfo,
      contentModule,
    );

    // ping
    let pong = false;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await bg.evaluate(async (tabId) => {
          return await chrome.tabs.sendMessage(tabId, { action: "ping" });
        }, tabInfo);
        if (res?.ok) {
          pong = true;
          break;
        }
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    assert(pong, "Content script ping failed after inject");
    results.passed.push("content script inject + ping");

    // detectForms
    const detected = await bg.evaluate(async (tabId) => {
      return await chrome.tabs.sendMessage(tabId, { action: "detectForms" });
    }, tabInfo);
    console.log("detectForms:", JSON.stringify(detected, null, 2));
    assert(detected?.count >= 6, `Expected >=6 fields, got ${detected?.count}`);
    results.passed.push(`detectForms count=${detected.count}`);

    // fillForm
    const fill = await bg.evaluate(async (tabId) => {
      return await chrome.tabs.sendMessage(tabId, { action: "fillForm" });
    }, tabInfo);
    console.log("fillForm:", JSON.stringify(fill, null, 2));
    assert(fill?.success, "fillForm success=false: " + fill?.message);
    assert(fill?.stats?.filled >= 4, `Expected >=4 filled, got ${fill?.stats?.filled}`);
    results.passed.push(`fillForm filled=${fill.stats.filled}/${fill.stats.total}`);

    // Read DOM values
    const values = await page.evaluate(() => ({
      name: document.getElementById("full_name").value,
      email: document.getElementById("email").value,
      phone: document.getElementById("phone").value,
      city: document.getElementById("city").value,
      linkedin: document.getElementById("linkedin").value,
      exp: document.getElementById("exp").value,
      skills: document.getElementById("skills").value,
      country: document.getElementById("country").value,
      work: document.querySelector('input[name="work_type"]:checked')?.value || "",
    }));
    console.log("DOM values:", values);

    assert(values.name.includes("Ayush"), "name not filled: " + values.name);
    results.passed.push("name filled");
    assert(values.email === "ayush@example.com", "email not filled: " + values.email);
    results.passed.push("email filled");
    assert(values.phone.includes("555"), "phone not filled: " + values.phone);
    results.passed.push("phone filled");
    assert(values.city.includes("Francisco"), "city not filled: " + values.city);
    results.passed.push("city filled");

    return { ok: true, values, fill, detected };
  })();

  console.log("\n=== RESULTS ===");
  for (const p of results.passed) console.log("  PASS:", p);
  for (const f of results.failed) console.log("  FAIL:", f);

  if (!injectResult.ok) {
    throw new Error("Inject path failed: " + injectResult.reason);
  }

  console.log("\nAll critical checks passed.");
  process.exitCode = 0;
} catch (err) {
  console.error("\nTEST FAILED:", err);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.close();
}
