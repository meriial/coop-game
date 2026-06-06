interface Props {
  index: number;
}

const slides = [
  <Slide0 />,
  <Slide1 />,
  <Slide2 />,
];

export function SlideRenderer({ index }: Props) {
  return (
    <div className="w-full h-full flex items-center justify-center p-8 md:p-16">
      {slides[index] ?? <div className="text-slate-500 text-2xl">Slide {index}</div>}
    </div>
  );
}

function Slide0() {
  return (
    <div className="flex flex-col items-center text-center gap-8 max-w-3xl">
      <div className="text-8xl select-none">❤️</div>
      <h1 className="text-6xl md:text-7xl font-bold text-white leading-tight tracking-tight">
        Building with AI
      </h1>
      <p className="text-2xl text-slate-400 font-light">
        DrugBank Engineering Workshop
      </p>
      <div className="flex gap-3 mt-4">
        <span className="px-4 py-1.5 bg-indigo-500/20 text-indigo-300 rounded-full text-sm font-medium border border-indigo-500/30">
          Cloudflare Workers
        </span>
        <span className="px-4 py-1.5 bg-pink-500/20 text-pink-300 rounded-full text-sm font-medium border border-pink-500/30">
          Durable Objects
        </span>
        <span className="px-4 py-1.5 bg-emerald-500/20 text-emerald-300 rounded-full text-sm font-medium border border-emerald-500/30">
          Real-time WebSockets
        </span>
      </div>
    </div>
  );
}

function Slide1() {
  return (
    <div className="flex flex-col gap-10 max-w-3xl w-full">
      <div>
        <p className="text-indigo-400 font-semibold text-lg uppercase tracking-widest mb-3">Today's Goal</p>
        <h2 className="text-5xl md:text-6xl font-bold text-white leading-tight">
          The Game Plan
        </h2>
      </div>
      <ul className="flex flex-col gap-5">
        {[
          { icon: '⚡', label: 'Real-time WebSocket server', sub: 'on Cloudflare Workers' },
          { icon: '🗄️', label: 'Durable Objects', sub: 'for persistent shared game state' },
          { icon: '📦', label: 'Browser SDK', sub: 'TypeScript client anyone can drop in' },
          { icon: '🎨', label: 'Cooperative pixel art game', sub: 'fill the heart together' },
        ].map(({ icon, label, sub }) => (
          <li key={label} className="flex items-start gap-4">
            <span className="text-3xl mt-0.5">{icon}</span>
            <div>
              <span className="text-white text-xl font-semibold">{label}</span>
              <span className="text-slate-400 text-lg"> — {sub}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Slide2() {
  return (
    <div className="flex flex-col gap-10 max-w-3xl w-full">
      <div>
        <p className="text-emerald-400 font-semibold text-lg uppercase tracking-widest mb-3">What's Next</p>
        <h2 className="text-5xl md:text-6xl font-bold text-white leading-tight">
          Keep Building
        </h2>
      </div>
      <p className="text-slate-300 text-xl">Ideas to extend your game:</p>
      <ul className="grid grid-cols-2 gap-4">
        {[
          { icon: '🎉', label: 'Confetti on victory' },
          { icon: '🤖', label: 'Auto-bot that fills cells' },
          { icon: '🔊', label: 'Sound effects on paint' },
          { icon: '🎨', label: 'Custom color picker' },
          { icon: '📊', label: 'Personal score counter' },
          { icon: '🖼️', label: 'New target image' },
        ].map(({ icon, label }) => (
          <li key={label} className="flex items-center gap-3 bg-slate-800/60 rounded-xl px-4 py-3 border border-slate-700/50">
            <span className="text-2xl">{icon}</span>
            <span className="text-white text-base font-medium">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
