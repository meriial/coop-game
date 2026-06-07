import React, { createContext, useContext } from "react";
import type { LucideIcon } from "lucide-react";

export type Accent = "indigo" | "pink" | "emerald";
export type Bg = "dot" | "line" | "pixel";
type Gap = "sm" | "md" | "lg";

const AccentCtx = createContext<Accent>("indigo");

const accentRgb: Record<Accent, string> = {
  indigo: "99,102,241",
  pink: "236,72,153",
  emerald: "16,185,129",
};

const ac: Record<
  Accent,
  {
    text: string;
    textLight: string;
    bg: string;
    border: string;
    borderAccent: string;
    gradFrom: string;
    gradTo: string;
    shadow: string;
  }
> = {
  indigo: {
    text: "text-indigo-400",
    textLight: "text-indigo-300",
    bg: "bg-indigo-500/20",
    border: "border-indigo-500/30",
    borderAccent: "border-l-indigo-500/70",
    gradFrom: "from-indigo-500/20",
    gradTo: "to-indigo-400/10",
    shadow: "shadow-indigo-500/10",
  },
  pink: {
    text: "text-pink-400",
    textLight: "text-pink-300",
    bg: "bg-pink-500/20",
    border: "border-pink-500/30",
    borderAccent: "border-l-pink-500/70",
    gradFrom: "from-pink-500/20",
    gradTo: "to-pink-400/10",
    shadow: "shadow-pink-500/10",
  },
  emerald: {
    text: "text-emerald-400",
    textLight: "text-emerald-300",
    bg: "bg-emerald-500/20",
    border: "border-emerald-500/30",
    borderAccent: "border-l-emerald-500/70",
    gradFrom: "from-emerald-500/20",
    gradTo: "to-emerald-400/10",
    shadow: "shadow-emerald-500/10",
  },
};

function bgStyle(bg: Bg, accent: Accent): React.CSSProperties {
  const rgb = accentRgb[accent];
  if (bg === "dot")
    return {
      backgroundImage: `radial-gradient(circle, rgba(${rgb},0.18) 1.5px, transparent 1.5px)`,
      backgroundSize: "28px 28px",
    };
  if (bg === "line")
    return {
      backgroundImage: `linear-gradient(rgba(${rgb},0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(${rgb},0.06) 1px, transparent 1px)`,
      backgroundSize: "48px 48px",
    };
  return {
    backgroundImage: `linear-gradient(rgba(${rgb},0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(${rgb},0.07) 1px, transparent 1px)`,
    backgroundSize: "18px 18px",
  };
}

const gapClass: Record<Gap, string> = { sm: "gap-4", md: "gap-8", lg: "gap-10" };

// ── Root ────────────────────────────────────────────────────────────────────

export function Slide({
  bg,
  accent = "indigo",
  children,
}: {
  bg: Bg;
  accent?: Accent;
  children: React.ReactNode;
}) {
  return (
    <AccentCtx.Provider value={accent}>
      <div
        className="w-full h-full flex items-center justify-center p-8 md:p-16"
        style={bgStyle(bg, accent)}
      >
        {children}
      </div>
    </AccentCtx.Provider>
  );
}

// Constrained max-width column for content slides
export function Content({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-10 max-w-4xl w-full">{children}</div>
  );
}

// ── Layout ──────────────────────────────────────────────────────────────────

export function Stack({
  gap = "md",
  align = "start",
  children,
}: {
  gap?: Gap;
  align?: "start" | "center";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col ${gapClass[gap]}${align === "center" ? " items-center text-center" : ""}`}
    >
      {children}
    </div>
  );
}

// ── Typography ──────────────────────────────────────────────────────────────

export function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-[7.5rem] md:text-[9rem] font-bold text-white leading-tight tracking-tight">
      {children}
    </h1>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[6rem] md:text-[7.5rem] font-bold text-white leading-tight">
      {children}
    </h2>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  const accent = useContext(AccentCtx);
  return (
    <p
      className={`${ac[accent].text} font-semibold text-base uppercase tracking-[0.2em]`}
    >
      {children}
    </p>
  );
}

export function Subtext({ children }: { children: React.ReactNode }) {
  return <p className="text-2xl text-slate-400">{children}</p>;
}

// Label + H2 combined header block for content slides
export function Header({ label, heading }: { label: string; heading: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Label>{label}</Label>
      <H2>{heading}</H2>
    </div>
  );
}

// ── Decorative ──────────────────────────────────────────────────────────────

export function IconBadge({ icon: Icon }: { icon: LucideIcon }) {
  const accent = useContext(AccentCtx);
  const a = ac[accent];
  return (
    <div
      className={`p-5 rounded-2xl bg-gradient-to-br ${a.gradFrom} ${a.gradTo} border ${a.border} shadow-lg ${a.shadow}`}
    >
      <Icon size={56} className={a.text} strokeWidth={1.5} />
    </div>
  );
}

export function Tag({
  children,
  accent: tagAccent,
}: {
  children: React.ReactNode;
  accent?: Accent;
}) {
  const slideAccent = useContext(AccentCtx);
  const a = ac[tagAccent ?? slideAccent];
  return (
    <span
      className={`px-5 py-2.5 ${a.bg} ${a.textLight} rounded-full text-base font-medium border ${a.border}`}
    >
      {children}
    </span>
  );
}

export function TagRow({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-4 flex-wrap">{children}</div>;
}

// ── List layouts ────────────────────────────────────────────────────────────

const ListIndexCtx = createContext(0);

function withListIndex(children: React.ReactNode) {
  return React.Children.toArray(children).map((child, i) => (
    <ListIndexCtx.Provider key={i} value={i}>
      {child}
    </ListIndexCtx.Provider>
  ));
}

export function BulletList({ children }: { children: React.ReactNode }) {
  return <ul className="flex flex-col gap-4">{withListIndex(children)}</ul>;
}

export function BulletListItem({
  icon: Icon,
  label,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  sub: string;
}) {
  const i = useContext(ListIndexCtx);
  const accent = useContext(AccentCtx);
  const a = ac[accent];
  return (
    <li
      className={`anim-in flex items-center gap-4 bg-slate-800/40 rounded-xl px-5 py-4 border border-slate-700/40 border-l-[3px] ${a.borderAccent}`}
      style={{ animationDelay: `${i * 0.1}s` }}
    >
      <span className="w-8 shrink-0 flex items-center justify-center">
        <Icon size={24} className={a.text} strokeWidth={1.75} />
      </span>
      <div>
        <span className="text-white text-xl font-semibold">{label}</span>
        <span className="text-slate-400 text-lg"> — {sub}</span>
      </div>
    </li>
  );
}

export function IconGrid({ children }: { children: React.ReactNode }) {
  return (
    <ul className="grid grid-cols-2 gap-4">{withListIndex(children)}</ul>
  );
}

export function IconGridItem({
  icon: Icon,
  label,
}: {
  icon: LucideIcon;
  label: string;
}) {
  const i = useContext(ListIndexCtx);
  const accent = useContext(AccentCtx);
  const a = ac[accent];
  return (
    <li
      className="anim-in flex items-center gap-3 bg-slate-800/60 rounded-xl px-4 py-3 border border-slate-700/50"
      style={{ animationDelay: `${i * 0.08}s` }}
    >
      <span className="w-6 shrink-0 flex items-center justify-center">
        <Icon size={20} className={a.text} strokeWidth={1.75} />
      </span>
      <span className="text-white text-base font-medium">{label}</span>
    </li>
  );
}
