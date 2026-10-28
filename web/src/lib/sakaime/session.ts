import { items, readings } from "@/lib/sakaime/content";
import { isDue } from "@/lib/sakaime/progress";
import type { ChoiceItem, LiveChoice, Progress, Reading, Skill } from "@/lib/sakaime/types";

export function shuffle<T>(list: readonly T[]): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = arr[i] as T;
    const b = arr[j] as T;
    arr[i] = b;
    arr[j] = a;
  }
  return arr;
}

export function toLive(item: ChoiceItem, retried = false): LiveChoice {
  const options = shuffle(item.choices.map((text, i) => ({ text, ok: i === item.answer })));
  return { item, options, retried };
}

export function pickItems(pool: ChoiceItem[], progress: Progress, n: number, today: string): ChoiceItem[] {
  const due = shuffle(pool.filter((it) => isDue(progress, it.id, today)));
  const later = pool
    .filter((it) => !isDue(progress, it.id, today))
    .sort((a, b) => (progress.cards[a.id]?.ease ?? 2.3) - (progress.cards[b.id]?.ease ?? 2.3));
  const chosen: ChoiceItem[] = [];
  for (const it of [...due, ...later]) {
    if (chosen.length >= n) break;
    chosen.push(it);
  }
  return chosen;
}

export function ofSkill(skill: Skill): ChoiceItem[] {
  return items.filter((it) => it.skill === skill);
}

export function dueCount(progress: Progress, today: string): number {
  return items.filter((it) => isDue(progress, it.id, today)).length;
}

export function pickReading(progress: Progress): Reading {
  const ranked = [...readings].sort((a, b) => {
    const as = progress.readings[a.id]?.seen ?? 0;
    const bs = progress.readings[b.id]?.seen ?? 0;
    return as - bs;
  });
  const least = ranked[0]?.id ? (progress.readings[ranked[0].id]?.seen ?? 0) : 0;
  const pool = ranked.filter((r) => (progress.readings[r.id]?.seen ?? 0) === least);
  return shuffle(pool)[0] ?? readings[0]!;
}

export function findItem(id: string): ChoiceItem | undefined {
  return items.find((it) => it.id === id);
}

export function findReading(id: string): Reading | undefined {
  return readings.find((r) => r.id === id);
}
