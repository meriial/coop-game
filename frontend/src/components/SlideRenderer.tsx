import {
  Zap,
  Database,
  Package,
  Grid2x2,
  Sparkles,
  Bot,
  Volume2,
  Pipette,
  BarChart2,
  ImageIcon,
  Heart,
} from "lucide-react";

interface Props {
  index: number;
}

const slides = [<Slide0 />, <Slide1 />, <Slide2 />];

export function SlideRenderer({ index }: Props) {
  return (
    <div className="w-full h-full flex items-center justify-center">
      {slides[index] ?? (
        <div className="text-slate-500 text-2xl">Slide {index}</div>
      )}
    </div>
  );
}

const dotGridBg: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(circle, rgba(99,102,241,0.18) 1.5px, transparent 1.5px)",
  backgroundSize: "28px 28px",
};

const lineGridBg: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)",
  backgroundSize: "48px 48px",
};

const pixelGridBg: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(16,185,129,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.07) 1px, transparent 1px)",
  backgroundSize: "18px 18px",
};

function Slide0() {
  return (
    <div
      className="w-full h-full flex items-center justify-center p-8 md:p-16"
      style={dotGridBg}
    >
      <div className="flex flex-col items-center text-center gap-8 max-w-4xl">
        <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-pink-500/20 border border-indigo-500/30 shadow-lg shadow-indigo-500/10">
          <Heart size={56} className="text-pink-400" strokeWidth={1.5} />
        </div>
        <h1 className="text-6xl md:text-7xl font-bold text-white leading-tight tracking-tight">
          Building with AI
        </h1>
        <p className="text-2xl text-slate-400">less wand, more wizard</p>
        <div className="flex gap-4 mt-2">
          <span className="px-5 py-2.5 bg-indigo-500/20 text-indigo-300 rounded-full text-base font-medium border border-indigo-500/30">
            Cloudflare Workers
          </span>
          <span className="px-5 py-2.5 bg-pink-500/20 text-pink-300 rounded-full text-base font-medium border border-pink-500/30">
            Durable Objects
          </span>
          <span className="px-5 py-2.5 bg-emerald-500/20 text-emerald-300 rounded-full text-base font-medium border border-emerald-500/30">
            Real-time WebSockets
          </span>
        </div>
      </div>
    </div>
  );
}

const slide1Items = [
  {
    icon: (
      <Zap size={24} className="text-indigo-400" strokeWidth={1.75} />
    ),
    label: "Real-time WebSocket server",
    sub: "on Cloudflare Workers",
  },
  {
    icon: (
      <Database size={24} className="text-indigo-400" strokeWidth={1.75} />
    ),
    label: "Durable Objects",
    sub: "for persistent shared game state",
  },
  {
    icon: (
      <Package size={24} className="text-indigo-400" strokeWidth={1.75} />
    ),
    label: "Browser SDK",
    sub: "TypeScript client anyone can drop in",
  },
  {
    icon: (
      <Grid2x2 size={24} className="text-indigo-400" strokeWidth={1.75} />
    ),
    label: "Cooperative pixel art game",
    sub: "fill the heart together",
  },
];

function Slide1() {
  return (
    <div
      className="w-full h-full flex items-center justify-center p-8 md:p-16"
      style={lineGridBg}
    >
      <div className="flex flex-col gap-10 max-w-4xl w-full">
        <div>
          <p className="text-indigo-400 font-semibold text-base uppercase tracking-[0.2em] mb-4">
            Today's Goal
          </p>
          <h2 className="text-5xl md:text-6xl font-bold text-white leading-tight">
            The Game Plan
          </h2>
        </div>
        <ul className="flex flex-col gap-4">
          {slide1Items.map(({ icon, label, sub }, i) => (
            <li
              key={label}
              className="anim-in flex items-center gap-4 bg-slate-800/40 rounded-xl px-5 py-4 border border-slate-700/40 border-l-[3px] border-l-indigo-500/70"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <span className="w-8 shrink-0 flex items-center justify-center">
                {icon}
              </span>
              <div>
                <span className="text-white text-xl font-semibold">
                  {label}
                </span>
                <span className="text-slate-400 text-lg"> — {sub}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const slide2Items = [
  {
    icon: (
      <Sparkles size={20} className="text-emerald-400" strokeWidth={1.75} />
    ),
    label: "Confetti on victory",
  },
  {
    icon: <Bot size={20} className="text-emerald-400" strokeWidth={1.75} />,
    label: "Auto-bot that fills cells",
  },
  {
    icon: (
      <Volume2 size={20} className="text-emerald-400" strokeWidth={1.75} />
    ),
    label: "Sound effects on paint",
  },
  {
    icon: (
      <Pipette size={20} className="text-emerald-400" strokeWidth={1.75} />
    ),
    label: "Custom color picker",
  },
  {
    icon: (
      <BarChart2 size={20} className="text-emerald-400" strokeWidth={1.75} />
    ),
    label: "Personal score counter",
  },
  {
    icon: (
      <ImageIcon size={20} className="text-emerald-400" strokeWidth={1.75} />
    ),
    label: "New target image",
  },
];

function Slide2() {
  return (
    <div
      className="w-full h-full flex items-center justify-center p-8 md:p-16"
      style={pixelGridBg}
    >
      <div className="flex flex-col gap-10 max-w-4xl w-full">
        <div>
          <p className="text-emerald-400 font-semibold text-base uppercase tracking-[0.2em] mb-4">
            What's Next
          </p>
          <h2 className="text-5xl md:text-6xl font-bold text-white leading-tight">
            Keep Building
          </h2>
        </div>
        <ul className="grid grid-cols-2 gap-4">
          {slide2Items.map(({ icon, label }, i) => (
            <li
              key={label}
              className="anim-in flex items-center gap-3 bg-slate-800/60 rounded-xl px-4 py-3 border border-slate-700/50"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <span className="w-6 shrink-0 flex items-center justify-center">
                {icon}
              </span>
              <span className="text-white text-base font-medium">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
