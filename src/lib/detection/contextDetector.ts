/** Detects what kind of form/page the user is on. */

import type { FormContext } from "@/shared/types";

const JOB_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "workday.com",
  "myworkdayjobs.com",
  "bamboohr.com",
  "jobvite.com",
  "icims.com",
  "taleo.net",
  "smartrecruiters.com",
  "indeed.com",
  "wellfound.com",
  "dover.com",
  "ashbyhq.com",
  "personio.com",
  "zoho.com",
  "recruitee.com",
];

const SURVEY_DOMAINS = [
  "typeform.com",
  "surveymonkey.com",
  "docs.google.com/forms",
  "forms.office.com",
  "form.jotform.com",
  "qualtrics.com",
  "surveyhero.com",
  "alchemer.com",
];

const GOV_DOMAINS = [".gov", ".gov.", ".mil"];

const GOV_URL_PATTERNS = [
  /passport/i,
  /visa/i,
  /immigration/i,
  /tax/i,
  /dmv/i,
  /drivers?[-_]?license/i,
];

export function detectFormContext(): FormContext {
  const url = location.href.toLowerCase();
  const hostname = location.hostname.toLowerCase();
  const title = document.title.toLowerCase();
  const pathname = location.pathname.toLowerCase();

  let type: FormContext["type"] = "generic";
  let confidence = 0.3;

  // Government detection (check first — takes priority)
  if (
    GOV_DOMAINS.some((d) => hostname.endsWith(d)) ||
    GOV_URL_PATTERNS.some((p) => p.test(url))
  ) {
    type = "government";
    confidence = 0.85;
  }

  // Job application detection
  if (type === "generic") {
    const jobUrlPatterns = [
      /\/apply/i,
      /\/careers?\b/i,
      /\/jobs?\b/i,
      /\/positions?\b/i,
      /\/openings?\b/i,
      /\/opportunities?\b/i,
    ];
    const jobTitleKeywords = [
      "apply",
      "careers",
      "career",
      "job",
      "position",
      "opportunity",
      "join us",
      "we're hiring",
      "open role",
    ];
    const jobFieldIndicators = [
      "resume",
      "cover letter",
      "work authorization",
      "sponsorship",
      "linkedin",
      "github",
      "portfolio",
    ];

    let score = 0;

    if (JOB_DOMAINS.some((d) => hostname.includes(d))) {
      score += 3;
    }
    if (jobUrlPatterns.some((p) => p.test(pathname))) {
      score += 2;
    }
    if (jobTitleKeywords.some((kw) => title.includes(kw))) {
      score += 1;
    }

    // Check page body for job-specific field indicators
    const bodyText = document.body.textContent?.toLowerCase() || "";
    const matchingIndicators = jobFieldIndicators.filter((ind) =>
      bodyText.includes(ind),
    );
    score += matchingIndicators.length;

    if (score >= 3) {
      type = "job-application";
      confidence = Math.min(0.95, 0.6 + score * 0.08);
    }
  }

  // Survey detection
  if (type === "generic") {
    const surveyTitleKeywords = [
      "survey",
      "feedback",
      "questionnaire",
      "poll",
    ];

    if (SURVEY_DOMAINS.some((d) => hostname.includes(d))) {
      type = "survey";
      confidence = 0.9;
    } else if (surveyTitleKeywords.some((kw) => title.includes(kw))) {
      type = "survey";
      confidence = 0.6;
    } else if (title.includes("forms") && pathname.includes("form")) {
      // Generic Google/Office Forms
      type = "survey";
      confidence = 0.5;
    }
  }

  // Checkout detection
  if (type === "generic") {
    const checkoutPatterns = [/\/checkout/i, /\/cart/i, /\/payment/i, /\/billing/i];
    const checkoutKeywords = ["checkout", "payment", "billing", "shipping", "card number", "cvv"];

    if (checkoutPatterns.some((p) => p.test(pathname))) {
      type = "checkout";
      confidence = 0.7;
    } else {
      const bodyText = document.body.textContent?.toLowerCase() || "";
      if (checkoutKeywords.filter((k) => bodyText.includes(k)).length >= 2) {
        type = "checkout";
        confidence = 0.55;
      }
    }
  }

  // Registration detection
  if (type === "generic") {
    const regPatterns = [/\/register/i, /\/signup/i, /\/sign-up/i, /\/join/i, /\/create-account/i];
    const regKeywords = ["register", "sign up", "create account"];

    if (regPatterns.some((p) => p.test(pathname))) {
      type = "registration";
      confidence = 0.7;
    } else if (regKeywords.some((kw) => title.includes(kw))) {
      type = "registration";
      confidence = 0.55;
    }
  }

  // Contact detection
  if (type === "generic") {
    const contactPatterns = [/\/contact/i, /\/reach-us/i, /\/get-in-touch/i];
    if (contactPatterns.some((p) => p.test(pathname))) {
      type = "contact";
      confidence = 0.65;
    }
  }

  // Login detection
  if (type === "generic") {
    const loginPatterns = [/\/login/i, /\/signin/i, /\/sign-in/i, /\/auth/i];
    if (loginPatterns.some((p) => p.test(pathname))) {
      type = "login";
      confidence = 0.7;
    }
  }

  // Feedback detection
  if (type === "generic") {
    if (title.includes("feedback") || title.includes("review")) {
      type = "feedback";
      confidence = 0.55;
    }
  }

  return { type, domain: hostname, pageTitle: document.title, confidence };
}
