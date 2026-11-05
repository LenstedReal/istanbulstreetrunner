// Legal texts shown in the game. The same JSON generates the web pages in docs/
// (scripts/build_legal_pages.py), so the in-game and web texts never drift apart.
import type { Lang } from "@/src/i18n";

import legal from "./legal.json";

export type LegalDoc = "privacy" | "terms" | "licenses" | "deletion";

export interface LegalSection {
  h: string;
  p: string[];
}

export interface LegalText {
  title: string;
  intro: string;
  sections: LegalSection[];
}

export const LEGAL_UPDATED: string = legal.updated;
/** Date of the last change to one document: its own "updated" when it has one, else the shared date (2.0.1). */
export function legalUpdated(doc: LegalDoc): string {
  const own = (legal as Record<string, unknown>)[doc] as { updated?: string } | undefined;
  return own?.updated ?? legal.updated;
}
export const LEGAL_CONTACT: string = legal.contact;
/** Public pages (GitHub Pages of the repository's docs/ folder). */
export const LEGAL_BASE_URL = (process.env.EXPO_PUBLIC_LEGAL_BASE_URL?.trim() || "https://lenstedreal.github.io/istanbulstreetrunner").replace(/\/$/, "");

export const LEGAL_PAGES: Record<LegalDoc, string> = {
  privacy: "privacy-policy.html",
  terms: "terms.html",
  licenses: "licenses.html",
  deletion: "delete-account.html",
};

export function legalText(doc: LegalDoc, lang: Lang): LegalText {
  const d = (legal as unknown as Record<LegalDoc, Record<Lang, LegalText>>)[doc];
  return d[lang] ?? d.tr;
}
