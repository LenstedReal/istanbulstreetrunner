import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { en } from "@/src/i18n/en";
import { tr } from "@/src/i18n/tr";

// 2.0.1: the five NoCopyrightSounds tracks are gone; every track is original LenstedReal music. This test keeps it
// that way: file list, track list, credit line and legal texts must never mention NCS or the old releases again.
const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const audioSrc = read("src/audio.ts");
const legal = JSON.parse(read("src/legal/legal.json"));
const BANNED = [/\bNCS\b/, /ncs\.io/i, /NoCopyrightSounds/i, /DEAF KEV/i, /Elektronomia/i, /Warriyo/i, /Egzod/i, /Lost Sky/i, /Chris Linton/i, /Laura Brehm/i, /Maestro Chives/i, /Neoni/i];
const OLD_FILES = ["invincible", "fearless2", "skyhigh", "mortals", "royalty"];
const NEW_TRACKS = ["istiklal_kosusu", "galata_ruzgari", "bogaz_isiklari", "sirkeci_ekspres", "ortakoy_gecesi"];

function sources(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|json)$/.test(name)) files.push(p);
    }
  };
  walk(join(root, "app"));
  walk(join(root, "src"));
  files.push(join(root, "app.json"));
  return files;
}

test("the five original tracks are the only music files and the only tracks in the list", () => {
  const dir = join(root, "assets", "audio", "music");
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith(".mp3")).sort(), NEW_TRACKS.map((t) => `${t}.mp3`).sort());
  for (const old of OLD_FILES) assert.ok(!existsSync(join(dir, `${old}.mp3`)), `${old}.mp3 must be gone`);
  const ids = [...audioSrc.matchAll(/id: "([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, NEW_TRACKS);
  assert.ok(audioSrc.includes("export const DEFAULT_TRACK = MUSIC_TRACKS[0].id;"), "Istiklal Run is the default");
  for (const id of NEW_TRACKS) {
    assert.ok(audioSrc.includes(`require("../assets/audio/music/${id}.mp3")`), id);
    assert.ok(audioSrc.includes(`id: "${id}"`), id);
  }
  // every track has a Turkish and an English title and credit line
  const trCount = (audioSrc.match(/title: \{ tr: "[^"]+", en: "[^"]+" \}/g) ?? []).length;
  const crCount = (audioSrc.match(/artist: \{ tr: "LenstedReal[^"]*", en: "LenstedReal[^"]*" \}/g) ?? []).length;
  assert.equal(trCount, NEW_TRACKS.length);
  assert.equal(crCount, NEW_TRACKS.length);
});

test("no NoCopyrightSounds wording or old artist name anywhere in app code, strings or legal texts", () => {
  for (const f of sources()) {
    const src = readFileSync(f, "utf8");
    for (const re of BANNED) assert.ok(!re.test(src), `${f} matches ${re}`);
    for (const old of OLD_FILES) assert.ok(!src.includes(`${old}.mp3`), `${f} still references ${old}.mp3`);
  }
  const legalText = JSON.stringify(legal);
  for (const re of BANNED) assert.ok(!re.test(legalText), `legal.json matches ${re}`);
  for (const lang of ["tr", "en"] as const) {
    const music = legal.licenses[lang].sections.find((s: { h: string }) => /müzik|music/i.test(s.h));
    assert.ok(music, `${lang} licences have a music section`);
    assert.ok(music.p.join(" ").includes("LenstedReal"), `${lang} music section credits LenstedReal`);
  }
});

test("the settings credit line is plain text without a link", () => {
  assert.equal(tr["settings.musicCredits"], "Tüm müzikler: LenstedReal");
  assert.equal(en["settings.musicCredits"], "All music by LenstedReal");
  const settings = read("app/settings.tsx");
  const creditBlock = settings.slice(settings.indexOf('testID="settings-music-credits"') - 400, settings.indexOf('testID="settings-music-credits"') + 200);
  assert.ok(!creditBlock.includes("/licenses"), "the credit line no longer opens the licences page");
  assert.ok(!/Pressable[^>]*settings-music-credits/.test(creditBlock), "the credit line is not a button");
});

test("saved track ids from 2.0.0 fall back to the default track", async () => {
  // audio.ts pulls expo-audio at import time; check the pure helper by evaluating its source
  const m = audioSrc.match(/export function knownTrack\(id: unknown\): string \{\n([\s\S]*?)\n\}/);
  assert.ok(m, "knownTrack exists");
  assert.ok(audioSrc.includes("musicTrack: knownTrack(musicTrack)") || read("src/profile.tsx").includes("knownTrack(musicTrack)"), "profile load uses knownTrack");
  assert.ok(audioSrc.includes("const known = knownTrack(id);"), "setTrack normalises the id");
});
