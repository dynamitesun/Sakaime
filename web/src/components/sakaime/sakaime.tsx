import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Flame,
  Library,
  MessageCircle,
  Newspaper,
  Notebook,
  RotateCcw,
  X,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Jp } from "@/components/sakaime/jp";
import { items, readings, skillMeta } from "@/lib/sakaime/content";
import {
  accuracyOf,
  emptyProgress,
  grade,
  gradeReading,
  lastDays,
  loadProgress,
  markBridged,
  saveProgress,
  todayKey,
} from "@/lib/sakaime/progress";
import {
  dueCount,
  findReading,
  ofSkill,
  pickItems,
  pickReading,
  shuffle,
  toLive,
} from "@/lib/sakaime/session";
import type { Answered, LiveChoice, Progress, Skill } from "@/lib/sakaime/types";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type View = "desk" | "drill" | "reading" | "done" | "list" | "stats" | "passages";

const modes: { skill: Skill | "reading"; icon: typeof BookOpen; ja: string; en: string }[] = [
  { skill: "grammar", icon: BookOpen, ja: "文法", en: "The patterns N2 actually splits on" },
  { skill: "nuance", icon: Library, ja: "類義", en: "変更 and 変化 are not the same verb" },
  { skill: "keigo", icon: MessageCircle, ja: "敬語", en: "Humble for you, honorific for them" },
  { skill: "reading", icon: Newspaper, ja: "読解", en: "Four short texts, two questions each" },
];

export function Sakaime() {
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [view, setView] = useState<View>("desk");
  const [today, setToday] = useState("");
  const [queue, setQueue] = useState<LiveChoice[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Answered[]>([]);
  const [title, setTitle] = useState("今日の橋");
  const [readingId, setReadingId] = useState<string | null>(null);
  const [streakable, setStreakable] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [readPicked, setReadPicked] = useState<number | null>(null);
  const [readCorrect, setReadCorrect] = useState(0);
  const [showEn, setShowEn] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Skill | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [armReset, setArmReset] = useState(false);
  const choiceLock = useRef(false);

  useEffect(() => {
    setToday(todayKey());
    setProgress(loadProgress());
  }, []);

  function patch(fn: (p: Progress) => Progress) {
    setProgress((prev) => {
      const next = fn(prev);
      saveProgress(next);
      return next;
    });
  }

  function goDesk() {
    setView("desk");
    setPicked(null);
    setReadPicked(null);
    setShowEn(false);
    setArmReset(false);
  }

  function startQueue(nextQueue: LiveChoice[], nextTitle: string, nextReading: string | null, counts: boolean) {
    setQueue(nextQueue);
    setIndex(0);
    setPicked(null);
    setAnswers([]);
    setTitle(nextTitle);
    setReadingId(nextReading);
    setStreakable(counts);
    setQIndex(0);
    setReadPicked(null);
    setReadCorrect(0);
    setShowEn(false);
    choiceLock.current = false;
    setView(nextQueue.length > 0 ? "drill" : "reading");
  }

  function startBridge() {
    const day = today || todayKey();
    const pickedItems = shuffle([
      ...pickItems(ofSkill("grammar"), progress, 4, day),
      ...pickItems(ofSkill("nuance"), progress, 2, day),
      ...pickItems(ofSkill("keigo"), progress, 2, day),
    ]);
    startQueue(
      pickedItems.map((it) => toLive(it)),
      "今日の橋",
      pickReading(progress).id,
      true,
    );
  }

  function startSkill(skill: Skill) {
    const day = today || todayKey();
    startQueue(
      shuffle(pickItems(ofSkill(skill), progress, 8, day)).map((it) => toLive(it)),
      skillMeta[skill].ja,
      null,
      true,
    );
  }

  function startOne(id: string) {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    startQueue([toLive(item)], item.label, null, false);
  }

  function startPassage(id: string) {
    setAnswers([]);
    setReadingId(id);
    setStreakable(true);
    setQIndex(0);
    setReadPicked(null);
    setReadCorrect(0);
    setShowEn(false);
    choiceLock.current = false;
    setTitle(findReading(id)?.title ?? "読解");
    setView("reading");
  }

  function startMisses() {
    const live = answers
      .filter((a) => !a.ok && a.skill !== "reading")
      .map((a) => items.find((it) => it.id === a.id))
      .flatMap((it) => (it ? [toLive(it)] : []));
    if (live.length === 0) {
      goDesk();
      return;
    }
    startQueue(live, "惜しかった形", null, false);
  }

  const current = queue[index];

  function choose(optionIndex: number) {
    if (choiceLock.current || picked !== null || !current) return;
    const option = current.options[optionIndex];
    if (!option) return;
    choiceLock.current = true;
    setPicked(optionIndex);
    if (current.retried) return;
    const correct = current.options.find((o) => o.ok)?.text ?? "";
    patch((p) => grade(p, current.item.id, option.ok, today || todayKey()));
    setAnswers((prev) => [
      ...prev,
      {
        id: current.item.id,
        label: current.item.label,
        prompt: current.item.prompt,
        skill: current.item.skill,
        ok: option.ok,
        chosen: option.text,
        correct,
      },
    ]);
    if (!option.ok) setQueue((qs) => [...qs, toLive(current.item, true)]);
  }

  function finish(finalAnswers: Answered[], alsoReading?: { id: string; correct: number }) {
    if (streakable || alsoReading) {
      patch((p) => {
        let next = alsoReading ? gradeReading(p, alsoReading.id, alsoReading.correct, 2) : p;
        if (streakable) next = markBridged(next, today || todayKey());
        return next;
      });
    }
    setAnswers(finalAnswers);
    setShowEn(false);
    setView("done");
  }

  function nextQuestion() {
    if (!current || picked === null) return;
    choiceLock.current = false;
    if (index + 1 < queue.length) {
      setIndex((i) => i + 1);
      setPicked(null);
      return;
    }
    if (readingId) {
      setQIndex(0);
      setReadPicked(null);
      setReadCorrect(0);
      setShowEn(false);
      setView("reading");
      return;
    }
    finish(answers);
  }

  function chooseRead(optionIndex: number) {
    if (choiceLock.current || readPicked !== null || !readingId) return;
    const reading = findReading(readingId);
    const question = reading?.questions[qIndex];
    if (!reading || !question) return;
    choiceLock.current = true;
    setReadPicked(optionIndex);
    const ok = optionIndex === question.answer;
    if (ok) setReadCorrect((n) => n + 1);
    setAnswers((prev) => [
      ...prev,
      {
        id: question.id,
        label: reading.title,
        prompt: question.prompt,
        skill: "reading",
        ok,
        chosen: question.choices[optionIndex] ?? "",
        correct: question.choices[question.answer],
      },
    ]);
  }

  function nextRead() {
    if (!readingId || readPicked === null) return;
    choiceLock.current = false;
    const reading = findReading(readingId);
    if (!reading) return;
    if (qIndex + 1 < reading.questions.length) {
      setQIndex((i) => i + 1);
      setReadPicked(null);
      return;
    }
    finish(answers, { id: reading.id, correct: readCorrect });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (view === "drill" && current) {
        if (e.key === "Enter" && picked !== null) {
          e.preventDefault();
          nextQuestion();
          return;
        }
        const n = Number(e.key);
        if (n >= 1 && n <= current.options.length && picked === null) choose(n - 1);
      }
      if (view === "reading") {
        if (e.key === "Enter" && readPicked !== null) {
          e.preventDefault();
          nextRead();
          return;
        }
        const n = Number(e.key);
        if (n >= 1 && n <= 4 && readPicked === null) chooseRead(n - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const w = window as unknown as { appBack?: () => boolean };
    w.appBack = () => {
      if (view === "desk") return false;
      goDesk();
      window.scrollTo(0, 0);
      return true;
    };
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, index, qIndex]);

  const due = today ? dueCount(progress, today) : null;
  const slippery = useMemo(
    () =>
      items
        .filter((it) => (progress.cards[it.id]?.lapses ?? 0) > 0)
        .sort((a, b) => (progress.cards[b.id]?.lapses ?? 0) - (progress.cards[a.id]?.lapses ?? 0))
        .slice(0, 3),
    [progress],
  );
  const shown = useMemo(() => {
    const q = query.trim();
    return items.filter((it) => {
      if (filter !== "all" && it.skill !== filter) return false;
      if (!q) return true;
      return `${it.label} ${it.gloss} ${it.why} ${it.example}`.toLowerCase().includes(q.toLowerCase());
    });
  }, [query, filter]);

  const dayStat = today ? progress.days[today] : undefined;
  const correctN = answers.filter((a) => a.ok).length;
  const reading = readingId ? findReading(readingId) : undefined;
  const readQuestion = reading?.questions[qIndex];

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <div className="h-1 bg-seal" />
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <button type="button" onClick={goDesk} className="flex items-center gap-3 text-left">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-seal font-serif text-lg text-seal">
              境
            </span>
            <span>
              <span className="block font-serif text-xl leading-none">境目</span>
              <span className="mt-1 block text-xs tracking-widest text-muted">SAKAIME</span>
            </span>
          </button>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-sm tabular-nums">
              <Flame className="size-4 text-seal" aria-hidden />
              {progress.streak}
            </span>
            <button
              type="button"
              onClick={() => {
                setArmReset(false);
                setView(view === "stats" ? "desk" : "stats");
              }}
              className="rounded-md border border-line bg-card px-3 py-2 text-sm"
            >
              記録
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 pb-20 pt-8">
        {view === "desk" && (
          <Desk
            due={due}
            bank={items.length}
            todayCount={dayStat?.answered ?? 0}
            fresh={items.every((it) => !progress.cards[it.id])}
            slippery={slippery}
            onBridge={startBridge}
            onSkill={(skill) => {
              if (skill === "reading") setView("passages");
              else startSkill(skill);
            }}
            onList={() => setView("list")}
            onOne={startOne}
          />
        )}

        {view === "drill" && current && (
          <section>
            <div className="flex items-center justify-between gap-3 text-sm text-muted">
              <button type="button" onClick={goDesk} className="inline-flex min-h-11 items-center gap-1">
                <ArrowLeft className="size-4" aria-hidden />
                机
              </button>
              <span className="tabular-nums">
                {title} · {index + 1}/{queue.length}
              </span>
            </div>
            <p className="mt-6 text-xs tracking-widest text-seal">
              {current.retried ? "もう一度" : skillMeta[current.item.skill].ja}
            </p>
            <h1 className="mt-2 font-serif text-2xl leading-relaxed text-balance" lang="ja">
              <Jp text={current.item.prompt} />
            </h1>
            <div className="mt-6 grid gap-3">
              {current.options.map((option, i) => {
                const revealed = picked !== null;
                const chosen = picked === i;
                return (
                  <button
                    key={option.text}
                    type="button"
                    disabled={revealed}
                    onClick={() => choose(i)}
                    className={cn(
                      "flex min-h-12 items-start gap-3 rounded-lg border px-4 py-3 text-left font-serif text-lg transition-colors duration-200 disabled:cursor-default",
                      !revealed && "border-line bg-card hover:border-ink",
                      revealed && option.ok && "border-ink bg-ink text-seal-ink",
                      revealed && chosen && !option.ok && "border-seal bg-card text-seal",
                      revealed && !option.ok && !chosen && "border-line bg-card text-muted",
                    )}
                  >
                    <span className="mt-1 font-sans text-sm tabular-nums">{i + 1}</span>
                    <span lang="ja">{option.text}</span>
                  </button>
                );
              })}
            </div>
            {picked !== null && (
              <div className="mt-8 border-t border-line pt-6">
                <p className={cn("text-sm font-medium", current.options[picked]?.ok ? "text-ink" : "text-seal")}>
                  {current.options[picked]?.ok ? "合っている" : "惜しい"}
                </p>
                <h2 className="mt-2 font-serif text-2xl" lang="ja">
                  {current.item.label}
                </h2>
                <p className="mt-1 text-muted">{current.item.gloss}</p>
                <p className="mt-4 text-pretty leading-relaxed">{current.item.why}</p>
                <blockquote className="mt-4 border-l-2 border-seal pl-4">
                  <p className="font-serif text-lg leading-relaxed" lang="ja">
                    <Jp text={current.item.example} />
                  </p>
                  <p className="mt-1 text-sm text-muted text-pretty">{current.item.exampleEn}</p>
                </blockquote>
                <button
                  type="button"
                  onClick={nextQuestion}
                  className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-lg bg-seal px-5 text-seal-ink"
                >
                  {index + 1 < queue.length ? "次へ" : readingId ? "読解へ" : "結果を見る"}
                  <ArrowRight className="size-4" aria-hidden />
                </button>
                <p className="mt-3 hidden text-sm text-muted sm:block">Keys 1–4 answer. Enter continues.</p>
              </div>
            )}
          </section>
        )}

        {view === "reading" && reading && readQuestion && (
          <section>
            <div className="flex items-center justify-between gap-3 text-sm text-muted">
              <button type="button" onClick={goDesk} className="inline-flex min-h-11 items-center gap-1">
                <ArrowLeft className="size-4" aria-hidden />
                机
              </button>
              <span>
                {reading.source} · {qIndex + 1}/{reading.questions.length}
              </span>
            </div>
            <h1 className="mt-6 font-serif text-3xl text-balance" lang="ja">
              {reading.title}
            </h1>
            <p className="mt-4 whitespace-pre-wrap font-serif text-xl leading-loose" lang="ja">
              <Jp text={reading.body} />
            </p>
            <h2 className="mt-8 font-serif text-xl leading-relaxed" lang="ja">
              {readQuestion.prompt}
            </h2>
            <div className="mt-4 grid gap-3">
              {readQuestion.choices.map((choice, i) => {
                const revealed = readPicked !== null;
                const ok = i === readQuestion.answer;
                const chosen = readPicked === i;
                return (
                  <button
                    key={choice}
                    type="button"
                    disabled={revealed}
                    onClick={() => chooseRead(i)}
                    className={cn(
                      "flex min-h-12 items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors duration-200 disabled:cursor-default",
                      !revealed && "border-line bg-card hover:border-ink",
                      revealed && ok && "border-ink bg-ink text-seal-ink",
                      revealed && chosen && !ok && "border-seal bg-card text-seal",
                      revealed && !ok && !chosen && "border-line bg-card text-muted",
                    )}
                  >
                    <span className="mt-0.5 text-sm tabular-nums">{i + 1}</span>
                    <span lang="ja">{choice}</span>
                  </button>
                );
              })}
            </div>
            {readPicked !== null && (
              <div className="mt-8 border-t border-line pt-6">
                <p className={cn("text-sm font-medium", readPicked === readQuestion.answer ? "text-ink" : "text-seal")}>
                  {readPicked === readQuestion.answer ? "合っている" : "惜しい"}
                </p>
                <p className="mt-3 text-pretty leading-relaxed">{readQuestion.why}</p>
                {qIndex === reading.questions.length - 1 && (
                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={() => setShowEn((v) => !v)}
                      className="text-sm text-seal"
                    >
                      {showEn ? "英語を隠す" : "英語を見る"}
                    </button>
                    {showEn && <p className="mt-2 text-pretty text-muted leading-relaxed">{reading.translation}</p>}
                  </div>
                )}
                <button
                  type="button"
                  onClick={nextRead}
                  className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-lg bg-seal px-5 text-seal-ink"
                >
                  {qIndex + 1 < reading.questions.length ? "次の問い" : "結果を見る"}
                  <ArrowRight className="size-4" aria-hidden />
                </button>
              </div>
            )}
          </section>
        )}

        {view === "done" && (
          <section>
            <p className="text-xs tracking-widest text-seal">{title}</p>
            <h1 className="mt-2 font-serif text-4xl tabular-nums text-balance">
              {correctN}/{answers.length || 0}
            </h1>
            <p className="mt-3 max-w-xl text-pretty text-muted">
              {correctN === answers.length && answers.length > 0
                ? "今日の分は越えた。間隔が空いたものから、また戻る。"
                : "境目は、間違えた形のほうに残る。説明をもう一度読んでから、その形だけやり直せる。"}
            </p>
            <ul className="mt-8 divide-y divide-line border-y border-line">
              {answers.map((a) => (
                <li key={a.id + a.prompt} className="flex gap-3 py-3">
                  <span className={cn("mt-1", a.ok ? "text-ink" : "text-seal")} aria-hidden>
                    {a.ok ? <Check className="size-4" /> : <X className="size-4" />}
                  </span>
                  <span>
                    <span className="block text-sm text-muted">{a.label}</span>
                    <span className="mt-1 block font-serif leading-relaxed" lang="ja">
                      <Jp text={a.prompt} />
                    </span>
                    {!a.ok && (
                      <span className="mt-1 block text-sm text-muted" lang="ja">
                        {a.chosen} → {a.correct}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={goDesk} className="min-h-12 rounded-lg bg-seal px-5 text-seal-ink">
                机に戻る
              </button>
              {answers.some((a) => !a.ok && a.skill !== "reading") && (
                <button type="button" onClick={startMisses} className="min-h-12 rounded-lg border border-line bg-card px-5">
                  惜しかった形だけ
                </button>
              )}
            </div>
          </section>
        )}

        {view === "passages" && (
          <section>
            <button type="button" onClick={goDesk} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted">
              <ArrowLeft className="size-4" aria-hidden />
              机
            </button>
            <h1 className="mt-4 font-serif text-4xl text-balance">短い文章を、推論で読む。</h1>
            <p className="mt-3 text-pretty text-muted">
              Don’t hunt for a copied sentence. The second question is usually what the writer refused to say outright.
            </p>
            <ul className="mt-8 grid gap-3">
              {readings.map((r) => {
                const stat = progress.readings[r.id];
                const pct = stat && stat.seen > 0 ? Math.round((stat.correct / stat.seen) * 100) : null;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => startPassage(r.id)}
                      className="flex w-full items-center justify-between gap-4 rounded-lg border border-line bg-card px-4 py-4 text-left hover:border-ink"
                    >
                      <span>
                        <span className="block text-xs tracking-widest text-muted">{r.source}</span>
                        <span className="mt-1 block font-serif text-xl" lang="ja">
                          {r.title}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-muted">{pct === null ? "未" : `${pct}%`}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {view === "list" && (
          <section>
            <button type="button" onClick={goDesk} className="inline-flex min-h-11 items-center gap-1 text-sm text-muted">
              <ArrowLeft className="size-4" aria-hidden />
              机
            </button>
            <h1 className="mt-4 font-serif text-4xl text-balance">帳面</h1>
            <p className="mt-3 text-pretty text-muted">Read the trap before you drill it. The question itself stays hidden.</p>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="わけ、keigo, vague…"
              autoComplete="off"
              className="mt-6 w-full rounded-lg border border-line bg-card px-4 py-3"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {(["all", "grammar", "nuance", "keigo"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    "min-h-11 rounded-full border px-4 text-sm",
                    filter === key ? "border-ink bg-ink text-seal-ink" : "border-line bg-card",
                  )}
                >
                  {key === "all" ? "すべて" : skillMeta[key].ja}
                </button>
              ))}
            </div>
            <ul className="mt-6 divide-y divide-line border-y border-line">
              {shown.map((it) => {
                const open = openId === it.id;
                const card = progress.cards[it.id];
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : it.id)}
                      className="flex w-full items-baseline justify-between gap-4 py-3 text-left"
                    >
                      <span>
                        <span className="block font-serif text-lg" lang="ja">
                          {it.label}
                        </span>
                        <span className="block text-sm text-muted">{it.gloss}</span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {card ? `${card.correct}/${card.seen}` : "—"}
                      </span>
                    </button>
                    {open && (
                      <div className="pb-4">
                        <p className="text-pretty leading-relaxed">{it.why}</p>
                        <blockquote className="mt-3 border-l-2 border-seal pl-4">
                          <p className="font-serif text-lg leading-relaxed" lang="ja">
                            <Jp text={it.example} />
                          </p>
                          <p className="mt-1 text-sm text-muted">{it.exampleEn}</p>
                        </blockquote>
                        <button
                          type="button"
                          onClick={() => startOne(it.id)}
                          className="mt-4 min-h-11 rounded-lg bg-seal px-4 text-sm text-seal-ink"
                        >
                          この一問
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {shown.length === 0 && <p className="mt-6 text-muted">その言葉は帳面にない。</p>}
          </section>
        )}

        {view === "stats" && (
          <Stats
            progress={progress}
            today={today}
            armReset={armReset}
            onArm={() => setArmReset(true)}
            onReset={() => {
              const blank = emptyProgress();
              saveProgress(blank);
              setProgress(blank);
              setArmReset(false);
            }}
            onDrillSlippery={() => {
              const weak = items
                .filter((it) => (progress.cards[it.id]?.lapses ?? 0) > 0)
                .sort((a, b) => (progress.cards[b.id]?.lapses ?? 0) - (progress.cards[a.id]?.lapses ?? 0))
                .slice(0, 8);
              if (weak.length === 0) return;
              startQueue(
                weak.map((it) => toLive(it)),
                "まだ滑る形",
                null,
                false,
              );
            }}
          />
        )}
      </main>
    </div>
  );
}

function Desk({
  due,
  bank,
  todayCount,
  fresh,
  slippery,
  onBridge,
  onSkill,
  onList,
  onOne,
}: {
  due: number | null;
  bank: number;
  todayCount: number;
  fresh: boolean;
  slippery: { id: string; label: string; gloss: string }[];
  onBridge: () => void;
  onSkill: (skill: Skill | "reading") => void;
  onList: () => void;
  onOne: (id: string) => void;
}) {
  return (
    <section>
      <p className="text-xs font-medium tracking-widest text-seal">N3 → N2</p>
      <h1 className="mt-2 max-w-xl font-serif text-4xl leading-tight text-balance">今日の境目を、一つ越える。</h1>
      <p className="mt-4 max-w-xl text-pretty text-muted leading-relaxed">
        Borderline grammar, near-synonyms, keigo, and short readings. Misses stay due. What you know steps aside until tomorrow.
      </p>
      <p className="mt-4 text-sm tabular-nums text-muted">
        {due === null ? "—" : fresh ? "Nothing reviewed yet" : `${due} due · ${bank} in the bank`} · {todayCount} answered today
      </p>
      <button
        type="button"
        onClick={onBridge}
        className="mt-6 flex w-full items-center justify-between gap-4 rounded-lg bg-seal px-5 py-4 text-left text-seal-ink"
      >
        <span>
          <span className="block font-serif text-2xl">今日の橋</span>
          <span className="mt-1 block text-sm">Eight questions, then one short reading.</span>
        </span>
        <ArrowRight className="size-5 shrink-0" aria-hidden />
      </button>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {modes.map((mode) => {
          const Icon = mode.icon;
          return (
            <button
              key={mode.ja}
              type="button"
              onClick={() => onSkill(mode.skill)}
              className="min-h-28 rounded-lg border border-line bg-card px-4 py-4 text-left hover:border-ink"
            >
              <Icon className="size-5 text-seal" aria-hidden />
              <span className="mt-3 block font-serif text-xl">{mode.ja}</span>
              <span className="mt-1 block text-sm text-muted text-pretty">{mode.en}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onList}
        className="mt-3 flex w-full items-center justify-between rounded-lg border border-line bg-card px-4 py-4 text-left hover:border-ink"
      >
        <span className="inline-flex items-center gap-3">
          <Notebook className="size-5 text-seal" aria-hidden />
          <span>
            <span className="block font-serif text-xl">帳面</span>
            <span className="block text-sm text-muted">Browse a pattern, then take the one question.</span>
          </span>
        </span>
        <ArrowRight className="size-4 text-muted" aria-hidden />
      </button>
      {slippery.length > 0 && (
        <div className="mt-10">
          <h2 className="font-serif text-xl">まだ滑る</h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {slippery.map((it) => (
              <li key={it.id}>
                <button type="button" onClick={() => onOne(it.id)} className="w-full py-3 text-left">
                  <span className="block font-serif text-lg" lang="ja">
                    {it.label}
                  </span>
                  <span className="block text-sm text-muted">{it.gloss}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stats({
  progress,
  today,
  armReset,
  onArm,
  onReset,
  onDrillSlippery,
}: {
  progress: Progress;
  today: string;
  armReset: boolean;
  onArm: () => void;
  onReset: () => void;
  onDrillSlippery: () => void;
}) {
  const days = today ? lastDays(today, 14) : [];
  const skills: Skill[] = ["grammar", "nuance", "keigo"];
  const lapses = items.filter((it) => (progress.cards[it.id]?.lapses ?? 0) > 0).length;
  return (
    <section>
      <p className="text-xs tracking-widest text-seal">記録</p>
      <h1 className="mt-2 font-serif text-4xl text-balance">この端末にだけ残る。</h1>
      <p className="mt-3 text-pretty text-muted">No account. A finished bridge — eight questions, or one reading — keeps the streak.</p>
      <dl className="mt-8 grid grid-cols-3 gap-3">
        <Stat n={progress.streak} label="連続" />
        <Stat n={progress.bestStreak} label="最長" />
        <Stat n={today ? (progress.days[today]?.answered ?? 0) : 0} label="今日" />
      </dl>
      <div className="mt-8 grid gap-4">
        {skills.map((skill) => (
          <Bar
            key={skill}
            label={skillMeta[skill].ja}
            value={accuracyOf(
              progress,
              items.filter((it) => it.skill === skill).map((it) => it.id),
            )}
          />
        ))}
      </div>
      <h2 className="mt-10 font-serif text-xl">十四日</h2>
      <div className="mt-3 flex gap-1">
        {days.map((day) => {
          const hit = progress.days[day]?.bridged;
          return <div key={day} title={day} className={cn("h-8 flex-1 rounded-sm", hit ? "bg-seal" : "bg-paper-2")} />;
        })}
      </div>
      <button
        type="button"
        onClick={onDrillSlippery}
        disabled={lapses === 0}
        className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-lg border border-line bg-card px-4 disabled:cursor-default disabled:text-muted"
      >
        まだ滑る形を解く
        <span className="tabular-nums text-sm text-muted">{lapses}</span>
      </button>
      <div className="mt-10">
        {armReset ? (
          <button type="button" onClick={onReset} className="inline-flex min-h-11 items-center gap-2 text-sm text-seal">
            <RotateCcw className="size-4" aria-hidden />
            もう一度押すと、記録は消える
          </button>
        ) : (
          <button type="button" onClick={onArm} className="min-h-11 text-sm text-muted">
            記録を消す
          </button>
        )}
      </div>
    </section>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-lg border border-line bg-card px-3 py-4">
      <dt className="text-xs tracking-widest text-muted">{label}</dt>
      <dd className="mt-1 font-serif text-3xl tabular-nums">{n}</dd>
    </div>
  );
}

function Bar({ label, value }: { label: string; value: number | null }) {
  const width = value === null ? 0 : Math.round(value * 100);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{value === null ? "—" : `${width}%`}</span>
      </div>
      <div className="h-2 rounded-full bg-paper-2">
        <div className="h-2 rounded-full bg-seal" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
