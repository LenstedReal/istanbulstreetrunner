// Runner presets and clothes bought with coins. Pure data and functions.
import type { StringKey } from "@/src/i18n/tr";

export type ItemKind = "runner" | "cap" | "jacket" | "shoes";

export interface RunnerLook {
  skin: number;
  hair: number;
  hairStyle: "short" | "long" | "bun" | "curly";
  jacket: number;
  jacketTrim: number;
  pants: number;
  shoes: number;
  cap: number | null;
  bag: number;
}

export interface Item {
  id: string;
  kind: ItemKind;
  price: number;
  /** Runner presets carry a full look; clothes change one colour. */
  look?: RunnerLook;
  color?: number;
  /** Second colour (trim, sole, stripe). */
  color2?: number;
  label: string;
  section: StringKey;
}

const runner = (id: string, label: string, price: number, look: RunnerLook): Item => ({ id, kind: "runner", price, look, label, section: "shop.runners" });
const cap = (id: string, label: string, price: number, color: number, color2: number): Item => ({ id, kind: "cap", price, color, color2, label, section: "shop.caps" });
const jacket = (id: string, label: string, price: number, color: number, color2: number): Item => ({ id, kind: "jacket", price, color, color2, label, section: "shop.jackets" });
const shoes = (id: string, label: string, price: number, color: number, color2: number): Item => ({ id, kind: "shoes", price, color, color2, label, section: "shop.shoes" });

export const CATALOG: Item[] = [
  runner("deniz", "Deniz", 0, { skin: 0xf1c27d, hair: 0x3a2518, hairStyle: "short", jacket: 0xd62828, jacketTrim: 0x9a1b1b, pants: 0x1f2a44, shoes: 0xfdfbf7, cap: 0x00a8cc, bag: 0x00a8cc }),
  runner("ece", "Ece", 600, { skin: 0xe8b48c, hair: 0x5a2e1a, hairStyle: "long", jacket: 0x2a7f62, jacketTrim: 0x1d5944, pants: 0x2b2b33, shoes: 0xf4e9dc, cap: null, bag: 0xe9c46a }),
  runner("baris", "Barış", 900, { skin: 0xa9714b, hair: 0x15100d, hairStyle: "curly", jacket: 0xf4a261, jacketTrim: 0xc6773a, pants: 0x34495e, shoes: 0x222222, cap: null, bag: 0x2d6a9f }),
  runner("lale", "Lale", 1200, { skin: 0xf6d2b4, hair: 0x9a5b2e, hairStyle: "bun", jacket: 0x6c4fa3, jacketTrim: 0x4c3778, pants: 0x1c1c24, shoes: 0xd62828, cap: null, bag: 0xd9a441 }),
  cap("cap-blue", "Boğaz mavisi kasket", 0, 0x00a8cc, 0x007a94),
  cap("cap-red", "Tramvay kırmızısı kasket", 300, 0xc62828, 0x8e1c1c),
  cap("cap-beret", "Bere", 450, 0x2f2f3a, 0x1c1c24),
  cap("cap-fisher", "Balıkçı şapkası", 600, 0xd9c49a, 0xa8925e),
  jacket("jacket-red", "Kırmızı mont", 0, 0xd62828, 0x9a1b1b),
  jacket("jacket-tile", "Çini mavisi", 500, 0x1e5fa8, 0xe8eef5),
  jacket("jacket-simit", "Simit sarısı", 500, 0xe0a33a, 0x9c6a1f),
  jacket("jacket-ferry", "Vapur beyazı", 700, 0xf4f1ea, 0x2a2626),
  shoes("shoes-white", "Beyaz", 0, 0xfdfbf7, 0xd9d4ca),
  shoes("shoes-black", "Siyah", 250, 0x222222, 0xdddddd),
  shoes("shoes-orange", "Turuncu", 350, 0xf4772e, 0xffffff),
];

export interface Wardrobe {
  owned: string[];
  runner: string;
  cap: string | null;
  jacket: string | null;
  shoes: string | null;
}

export const DEFAULT_WARDROBE: Wardrobe = { owned: ["deniz", "cap-blue", "jacket-red", "shoes-white"], runner: "deniz", cap: null, jacket: null, shoes: null };

export function item(id: string | null | undefined): Item | undefined {
  return id ? CATALOG.find((i) => i.id === id) : undefined;
}

export function parseWardrobe(raw: string | null | undefined): Wardrobe {
  if (!raw) return { ...DEFAULT_WARDROBE, owned: [...DEFAULT_WARDROBE.owned] };
  try {
    const v = JSON.parse(raw) as Partial<Wardrobe>;
    const owned = Array.from(new Set([...DEFAULT_WARDROBE.owned, ...(Array.isArray(v.owned) ? v.owned.filter((id) => !!item(id)) : [])]));
    const pick = (id: unknown, kind: ItemKind) => (typeof id === "string" && owned.includes(id) && item(id)?.kind === kind ? id : null);
    return { owned, runner: pick(v.runner, "runner") ?? "deniz", cap: pick(v.cap, "cap"), jacket: pick(v.jacket, "jacket"), shoes: pick(v.shoes, "shoes") };
  } catch {
    return { ...DEFAULT_WARDROBE, owned: [...DEFAULT_WARDROBE.owned] };
  }
}

/** The runner's final colours: preset look plus equipped clothes. */
export function lookOf(w: Wardrobe): RunnerLook {
  const base = item(w.runner)?.look ?? CATALOG[0].look!;
  const look = { ...base };
  const c = item(w.cap);
  if (c?.color !== undefined) look.cap = c.color;
  const j = item(w.jacket);
  if (j?.color !== undefined) {
    look.jacket = j.color;
    look.jacketTrim = j.color2 ?? j.color;
  }
  const s = item(w.shoes);
  if (s?.color !== undefined) look.shoes = s.color;
  return look;
}

export function buy(w: Wardrobe, id: string, balance: number): { wardrobe: Wardrobe; cost: number } | null {
  const it = item(id);
  if (!it || w.owned.includes(id) || balance < it.price) return null;
  return { wardrobe: equip({ ...w, owned: [...w.owned, id] }, id), cost: it.price };
}

export function equip(w: Wardrobe, id: string): Wardrobe {
  const it = item(id);
  if (!it || !w.owned.includes(id)) return w;
  return { ...w, [it.kind]: id } as Wardrobe;
}
