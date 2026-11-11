"use client";

// The prompt box at the bottom: auto-growing text area, aspect ratio, format, enhancer and seed.
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { FORMATS, type AspectRatio, type DownloadFormat } from "@/lib/api";
import { ArrowUpIcon, ChevronDownIcon, SparklesIcon } from "./icons";

export const ASPECTS: { value: AspectRatio; label: string; box: string }[] = [
  { value: "1:1", label: "Square", box: "h-3.5 w-3.5" },
  { value: "4:3", label: "Landscape", box: "h-3 w-4" },
  { value: "16:9", label: "Wide", box: "h-2.5 w-[18px]" },
  { value: "9:16", label: "Portrait", box: "h-[18px] w-2.5" },
];

interface Props {
  prompt: string;
  setPrompt: (v: string) => void;
  aspect: AspectRatio;
  setAspect: (v: AspectRatio) => void;
  format: DownloadFormat;
  setFormat: (v: DownloadFormat) => void;
  enhance: boolean;
  setEnhance: (v: boolean) => void;
  seed: string;
  setSeed: (v: string) => void;
  onSend: () => void;
  canSend: boolean;
  busy: boolean;
  maxChars: number;
  limitReached: boolean;
}

export type ComposerHandle = { focus: () => void };

const chip = "flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium ring-1 ring-line transition";

const Composer = forwardRef<ComposerHandle, Props>(function Composer(p, ref) {
  const area = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }));

  // Grow the text box with its content, up to a limit.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [p.prompt]);

  const over = p.prompt.length > p.maxChars;

  return (
    <div className="rounded-3xl border border-line bg-elev p-2 shadow-xl shadow-black/5 transition focus-within:border-violet-400/50 dark:shadow-black/40">
      <textarea
        ref={area}
        value={p.prompt}
        onChange={(e) => p.setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            p.onSend();
          }
        }}
        rows={1}
        disabled={p.limitReached}
        placeholder={p.limitReached ? "You've used today's images. Come back tomorrow." : "Describe the image you want to create…"}
        className="block max-h-[220px] w-full resize-none bg-transparent px-3 pb-2 pt-2.5 text-[15px] leading-relaxed text-fg outline-none placeholder:text-faint disabled:cursor-not-allowed"
      />
      <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1">
        {/* Aspect ratio */}
        <div className="flex rounded-xl bg-hover p-0.5 ring-1 ring-line">
          {ASPECTS.map((a) => (
            <button
              key={a.value}
              onClick={() => p.setAspect(a.value)}
              title={`${a.label} (${a.value})`}
              aria-pressed={p.aspect === a.value}
              className={`flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition ${
                p.aspect === a.value ? "bg-elev text-fg shadow-sm ring-1 ring-line" : "text-muted hover:text-fg"
              }`}
            >
              <span className={`rounded-[3px] border-[1.5px] border-current ${a.box}`} />
              <span className="hidden sm:inline">{a.value}</span>
            </button>
          ))}
        </div>

        {/* Image format */}
        <label className={`${chip} relative text-muted hover:text-fg`} title="Format used when you download">
          <span className="text-faint">Format</span>
          <select
            value={p.format}
            onChange={(e) => p.setFormat(e.target.value as DownloadFormat)}
            className="cursor-pointer appearance-none bg-transparent pr-4 font-semibold text-fg outline-none"
            aria-label="Image format"
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value} className="bg-elev text-fg">
                {f.label} ({f.hint})
              </option>
            ))}
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-2 h-3 w-3" />
        </label>

        {/* Prompt enhancer */}
        <button
          onClick={() => p.setEnhance(!p.enhance)}
          aria-pressed={p.enhance}
          title="Automatically add detail and quality words to short prompts"
          className={`${chip} ${p.enhance ? "bg-violet-500/15 text-violet-600 ring-violet-400/50 dark:text-violet-200" : "text-muted hover:text-fg"}`}
        >
          <SparklesIcon className="h-3.5 w-3.5" /> Enhance
        </button>

        {/* Seed */}
        <label className={`${chip} text-muted`} title="Same seed + same prompt = same image">
          Seed
          <input
            inputMode="numeric"
            placeholder="random"
            value={p.seed}
            onChange={(e) => p.setSeed(e.target.value.replace(/\D/g, "").slice(0, 10))}
            className="w-20 bg-transparent text-fg outline-none placeholder:text-faint"
          />
        </label>

        <span className={`ml-auto text-xs tabular-nums ${over ? "text-red-500" : "text-faint"}`}>
          {p.prompt.length > 0 && `${p.prompt.length}/${p.maxChars}`}
        </span>
        <button
          onClick={p.onSend}
          disabled={!p.canSend}
          aria-label="Generate image"
          title="Generate (Enter)"
          className="grid h-9 w-9 place-items-center rounded-full bg-btn text-btn-fg transition hover:opacity-85 disabled:bg-active disabled:text-faint"
        >
          {p.busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ArrowUpIcon />}
        </button>
      </div>
    </div>
  );
});

export default Composer;
