import type { CardStat, Progress } from "@/lib/sakaime/types";

const KEY = "sakaime-progress-v1";

export function emptyProgress(): Progress {
  return { cards: {}, readings: {}, days: {}, streak: 0, bestStreak: 0, lastDay: null };
}

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + n);
  return todayKey(dt);
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    if (!parsed || typeof parsed !== "object") return emptyProgress();
    return {
      cards: parsed.cards ?? {},
      readings: parsed.readings ?? {},
      days: parsed.days ?? {},
      streak: parsed.streak ?? 0,
      bestStreak: parsed.bestStreak ?? 0,
      lastDay: parsed.lastDay ?? null,
    };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Private mode or a full disk — the session still runs.
  }
}

function blankCard(today: string): CardStat {
  return { ease: 2.3, interval: 0, due: today, seen: 0, correct: 0, lapses: 0 };
}

export function grade(p: Progress, id: string, ok: boolean, today: string): Progress {
  const prev = p.cards[id] ?? blankCard(today);
  const next: CardStat = ok
    ? {
        ease: Math.min(2.6, prev.ease + 0.08),
        interval: prev.interval <= 0 ? 1 : Math.max(1, Math.round(prev.interval * prev.ease)),
        due: addDays(today, prev.interval <= 0 ? 1 : Math.max(1, Math.round(prev.interval * prev.ease))),
        seen: prev.seen + 1,
        correct: prev.correct + 1,
        lapses: prev.lapses,
      }
    : {
        ease: Math.max(1.3, prev.ease - 0.18),
        interval: 0,
        due: today,
        seen: prev.seen + 1,
        correct: prev.correct,
        lapses: prev.lapses + 1,
      };
  const day = p.days[today] ?? { answered: 0, correct: 0, bridged: false };
  return {
    ...p,
    cards: { ...p.cards, [id]: next },
    days: {
      ...p.days,
      [today]: { answered: day.answered + 1, correct: day.correct + (ok ? 1 : 0), bridged: day.bridged },
    },
  };
}

export function gradeReading(p: Progress, id: string, correct: number, total: number): Progress {
  const prev = p.readings[id] ?? { seen: 0, correct: 0 };
  return {
    ...p,
    readings: {
      ...p.readings,
      [id]: { seen: prev.seen + total, correct: prev.correct + correct },
    },
  };
}

export function markBridged(p: Progress, today: string): Progress {
  const day = p.days[today] ?? { answered: 0, correct: 0, bridged: false };
  if (day.bridged) return p;
  const yesterday = addDays(today, -1);
  const streak = p.lastDay === yesterday || p.lastDay === today ? p.streak + (p.lastDay === today ? 0 : 1) : 1;
  return {
    ...p,
    days: { ...p.days, [today]: { ...day, bridged: true } },
    streak,
    bestStreak: Math.max(p.bestStreak, streak),
    lastDay: today,
  };
}

export function isDue(p: Progress, id: string, today: string): boolean {
  const card = p.cards[id];
  return !card || card.due <= today;
}

export function accuracyOf(p: Progress, ids: string[]): number | null {
  let seen = 0;
  let correct = 0;
  for (const id of ids) {
    const card = p.cards[id];
    if (!card || card.seen === 0) continue;
    seen += card.seen;
    correct += card.correct;
  }
  if (seen === 0) return null;
  return correct / seen;
}

export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}
