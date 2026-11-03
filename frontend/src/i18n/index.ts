// Tiny i18n: Turkish and English. `t()` works anywhere; components call `useT()`
// (or `useLang()`) so they re-render when the language changes.
import { useSyncExternalStore } from "react";

import { en } from "./en";
import { tr, type StringKey } from "./tr";

export type Lang = "tr" | "en";
export type { StringKey };

function detect(): Lang {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    return locale.startsWith("tr") ? "tr" : "en";
  } catch {
    return "tr";
  }
}

let current: Lang = detect();
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function t(key: StringKey, params?: Record<string, string | number>): string {
  const table = current === "en" ? en : tr;
  let s: string = table[key] ?? tr[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** Hook form: subscribes the component to language changes and returns `t`. */
export function useT() {
  useLang();
  return t;
}

export function locale(): string {
  return current === "tr" ? "tr-TR" : "en-US";
}

/** Thousands-separated number in the current language. */
export function fmt(n: number): string {
  try {
    return Math.round(n).toLocaleString(locale());
  } catch {
    return String(Math.round(n));
  }
}

const MONTHS: Record<Lang, string[]> = {
  tr: ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/** "2026-11-04" or an ISO timestamp -> "4 Kasım 2026" / "4 November 2026" (pure string work). */
export function longDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[current][m - 1] ?? m} ${y}`;
}

/** "2026-11-04..." -> "04.11.2026" (TR) or "04/11/2026" (EN). */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return current === "tr" ? `${d}.${m}.${y}` : `${d}/${m}/${y}`;
}
