import { useState, useEffect, useRef, useCallback } from 'react';
import type { PollConfig, PollType } from '../config/presentationConfig';

interface PollWidgetProps {
  pollId: string;
  poll: PollConfig;
  pollResults: Record<string, number>;
  pollValues: string[];
  pollResetSeq: number;
  myVote: string | null;
  setMyVote: (v: string | null) => void;
  onVote: (pollId: string, value: string, pollType: PollType) => void;
  onResetPoll: (pollId: string) => void;
  isPresenter: boolean;
}

export function PollWidget(props: PollWidgetProps) {
  const { poll } = props;
  if (poll.type === 'choice') return <ChoiceWidget {...props} poll={poll} />;
  if (poll.type === 'slider1d') return <Slider1DWidget {...props} poll={poll} />;
  if (poll.type === 'slider2d') return <Slider2DWidget {...props} poll={poll} />;
  return null;
}

// ---------------------------------------------------------------------------
// Shared reset button
// ---------------------------------------------------------------------------

function ResetButton({ onReset }: { onReset: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <div className="flex items-center gap-2 text-xs justify-end">
      <span className="text-slate-400">Reset all votes?</span>
      <button onClick={() => { onReset(); setConfirm(false); }} className="text-red-400 hover:text-red-300 font-medium transition-colors">Yes</button>
      <button onClick={() => setConfirm(false)} className="text-slate-500 hover:text-slate-400 transition-colors">Cancel</button>
    </div>
  ) : (
    <button onClick={() => setConfirm(true)} className="text-slate-500 hover:text-slate-400 text-xs transition-colors self-end">
      Reset poll
    </button>
  );
}

// ---------------------------------------------------------------------------
// Choice poll
// ---------------------------------------------------------------------------

export function ChoiceResults({ results, options, totalVotes }: { results: Record<string, number>; options: string[]; totalVotes: number }) {
  return (
    <div className="flex flex-col gap-3">
      {options.map(option => {
        const count = results[option] ?? 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        return (
          <div key={option} className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-slate-400">
              <span>{option}</span>
              <span>{count} vote{count !== 1 ? 's' : ''} ({pct}%)</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="text-slate-500 text-xs text-center">{totalVotes} total vote{totalVotes !== 1 ? 's' : ''}</p>
    </div>
  );
}

function ChoiceWidget({ pollId, poll, pollResults, onVote, onResetPoll, isPresenter, myVote, setMyVote }: PollWidgetProps & { poll: Extract<PollConfig, { type: 'choice' }> }) {
  const totalVotes = Object.values(pollResults).reduce((s, n) => s + n, 0);
  const showResults = isPresenter || (myVote !== null && poll.showLiveResults);

  const handleVote = (choice: string) => {
    const next = myVote === choice ? null : choice;
    setMyVote(next);
    onVote(pollId, choice, 'choice');
  };

  return (
    <div className="flex flex-col gap-5">
      <h3 className="text-white text-xl font-bold leading-snug">{poll.question}</h3>
      {showResults ? (
        <ChoiceResults results={pollResults} options={poll.options} totalVotes={totalVotes} />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {poll.options.map(option => {
              const isSelected = myVote === option;
              return (
                <button
                  key={option}
                  onClick={() => handleVote(option)}
                  className={[
                    'w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all',
                    isSelected
                      ? 'bg-indigo-500 border-indigo-400 text-white'
                      : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700 hover:border-indigo-500 cursor-pointer',
                  ].join(' ')}
                >
                  {option}
                  {isSelected && <span className="float-right opacity-70 text-xs">tap to undo</span>}
                </button>
              );
            })}
          </div>
          {myVote
            ? <p className="text-slate-400 text-xs text-center">Voted · tap your choice to undo</p>
            : <p className="text-slate-500 text-xs text-center">Tap an option to vote</p>
          }
        </>
      )}
      {isPresenter && <ResetButton onReset={() => onResetPoll(pollId)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1D Slider
// ---------------------------------------------------------------------------

export function Slider1DResults({ values, leftLabel, rightLabel }: { values: string[]; leftLabel: string; rightLabel: string }) {
  const parsed = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
  const mean = parsed.length > 0 ? parsed.reduce((a, b) => a + b, 0) / parsed.length : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-10 flex items-center">
        {/* Track */}
        <div className="absolute inset-x-0 h-2 bg-slate-700 rounded-full" />
        {/* Tick marks */}
        {parsed.map((v, i) => (
          <div
            key={i}
            className="absolute w-0.5 h-4 bg-indigo-400/60 rounded-full -translate-x-1/2"
            style={{ left: `${v * 100}%` }}
          />
        ))}
        {/* Mean marker */}
        {mean !== null && (
          <div
            className="absolute w-1 h-6 bg-pink-400 rounded-full -translate-x-1/2 z-10"
            style={{ left: `${mean * 100}%` }}
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>{leftLabel}</span>
        <span className="text-slate-500">{parsed.length} response{parsed.length !== 1 ? 's' : ''}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

function Slider1DWidget({ pollId, poll, pollValues, pollResetSeq, onVote, onResetPoll, isPresenter, myVote, setMyVote }: PollWidgetProps & { poll: Extract<PollConfig, { type: 'slider1d' }> }) {
  const [localValue, setLocalValue] = useState(() => myVote !== null ? parseFloat(myVote) : 0.5);
  const [isDragging, setIsDragging] = useState(false);
  const hasVoted = myVote !== null;
  const trackRef = useRef<HTMLDivElement>(null);

  const prevResetSeq = useRef(pollResetSeq);
  useEffect(() => {
    if (pollResetSeq === prevResetSeq.current) return;
    prevResetSeq.current = pollResetSeq;
    setLocalValue(0.5);
  }, [pollResetSeq]);

  const valueFromEvent = useCallback((e: PointerEvent | React.PointerEvent) => {
    if (!trackRef.current) return localValue;
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }, [localValue]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPresenter) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setLocalValue(valueFromEvent(e));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setLocalValue(valueFromEvent(e));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    const v = valueFromEvent(e);
    setLocalValue(v);
    const encoded = v.toFixed(4);
    setMyVote(encoded);
    onVote(pollId, encoded, 'slider1d');
  };

  const showResults = isPresenter || (hasVoted && poll.showLiveResults);

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-white text-xl font-bold leading-snug">{poll.question}</h3>
      {showResults ? (
        <Slider1DResults values={pollValues} leftLabel={poll.leftLabel} rightLabel={poll.rightLabel} />
      ) : (
        <div className="flex flex-col gap-4">
          {/* Interactive track */}
          <div
            ref={trackRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={['relative h-10 flex items-center select-none', isPresenter ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'].join(' ')}
            style={{ touchAction: 'none' }}
          >
            <div className="absolute inset-x-0 h-2 bg-slate-700 rounded-full" />
            {/* Filled portion */}
            <div
              className="absolute left-0 h-2 bg-indigo-500 rounded-full transition-none"
              style={{ width: `${localValue * 100}%` }}
            />
            {/* Thumb */}
            <div
              className={['absolute w-5 h-5 rounded-full border-2 -translate-x-1/2 transition-none shadow-lg',
                isDragging ? 'bg-indigo-400 border-indigo-300 scale-110' : 'bg-white border-indigo-500',
              ].join(' ')}
              style={{ left: `${localValue * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-sm text-slate-400">
            <span>{poll.leftLabel}</span>
            <span>{poll.rightLabel}</span>
          </div>
          {!isPresenter && (
            <p className="text-slate-500 text-xs text-center">
              {hasVoted ? 'Response recorded · drag to update' : 'Drag to position, release to submit'}
            </p>
          )}
        </div>
      )}
      {isPresenter && <ResetButton onReset={() => onResetPoll(pollId)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2D Ternary slider
// ---------------------------------------------------------------------------

// SVG triangle vertices (equilateral, 400×347 viewBox)
const TRI_W = 400;
const TRI_H = 346;
const V: [number, number][] = [
  [200, 0],    // top   (label[0])
  [0, TRI_H],  // BL    (label[1])
  [TRI_W, TRI_H], // BR (label[2])
];

function crossZ(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

// Project point p onto the segment [a,b] (clamped)
function projectOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): [number, number] {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return [ax, ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return [ax + t * dx, ay + t * dy];
}

function clampToTriangle(px: number, py: number): [number, number] {
  // Clamp with 2 passes to handle corner cases
  let x = px, y = py;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 3; i++) {
      const a = V[i], b = V[(i + 1) % 3], c = V[(i + 2) % 3];
      // The "inside" side of edge a→b is the side c is on
      const cSign = crossZ(a[0], a[1], b[0], b[1], c[0], c[1]);
      const pSign = crossZ(a[0], a[1], b[0], b[1], x, y);
      if (cSign * pSign < 0) {
        // Outside this edge — project onto it
        const [nx, ny] = projectOnSegment(x, y, a[0], a[1], b[0], b[1]);
        x = nx; y = ny;
      }
    }
  }
  return [x, y];
}

function svgToBarycentric(x: number, y: number): [number, number, number] {
  // Solve for barycentric coords w.r.t. V[0], V[1], V[2]
  const [x1, y1] = V[0], [x2, y2] = V[1], [x3, y3] = V[2];
  const denom = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
  const w1 = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / denom;
  const w2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / denom;
  const w3 = 1 - w1 - w2;
  return [w1, w2, w3];
}

function barycentricToSvg(w1: number, w2: number, w3: number): [number, number] {
  return [
    w1 * V[0][0] + w2 * V[1][0] + w3 * V[2][0],
    w1 * V[0][1] + w2 * V[1][1] + w3 * V[2][1],
  ];
}

// Parse stored value string "w1,w2" → SVG coords
function parseBarySvg(s: string): [number, number] | null {
  const parts = s.split(',').map(Number);
  if (parts.length < 2 || parts.some(isNaN)) return null;
  const [w1, w2] = parts;
  const w3 = 1 - w1 - w2;
  return barycentricToSvg(w1, w2, w3);
}

export function Slider2DResults({ values, labels }: { values: string[]; labels: [string, string, string] }) {
  const points = values.map(parseBarySvg).filter((p): p is [number, number] => p !== null);
  const centroid: [number, number] | null = points.length > 0
    ? [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length]
    : null;

  // Mean barycentric for label percentages
  const meanBary = points.length > 0
    ? points.map(p => svgToBarycentric(p[0], p[1])).reduce(
        ([a0, a1, a2], [b0, b1, b2]) => [a0 + b0 / points.length, a1 + b1 / points.length, a2 + b2 / points.length] as [number, number, number],
        [0, 0, 0] as [number, number, number]
      )
    : null;

  return (
    <div className="flex flex-col gap-2 items-center">
      <svg viewBox={`-100 -80 ${TRI_W + 200} ${TRI_H + 160}`} className="w-full max-w-xs" style={{ overflow: 'visible' }}>
        <polygon
          points={V.map(v => v.join(',')).join(' ')}
          fill="rgba(99,102,241,0.08)"
          stroke="rgba(99,102,241,0.4)"
          strokeWidth="2"
        />
        {/* Vertex labels */}
        {labels.map((label, i) => {
          const [vx, vy] = V[i];
          const offsets: [number, number][] = [[0, -30], [-30, 36], [30, 36]];
          return (
            <text key={i} x={vx + offsets[i][0]} y={vy + offsets[i][1]} textAnchor="middle" fill="#94a3b8" fontSize="36" fontWeight="600">
              {label}
              {meanBary && (
                <tspan fill="#6366f1" fontSize="26" dy="0"> {Math.round(meanBary[i] * 100)}%</tspan>
              )}
            </text>
          );
        })}
        {/* Participant dots */}
        {points.map(([px, py], i) => (
          <circle key={i} cx={px} cy={py} r="5" fill="rgba(99,102,241,0.55)" stroke="rgba(99,102,241,0.8)" strokeWidth="1" />
        ))}
        {/* Centroid */}
        {centroid && (
          <circle cx={centroid[0]} cy={centroid[1]} r="8" fill="none" stroke="#f472b6" strokeWidth="2.5" />
        )}
      </svg>
      <p className="text-slate-500 text-xs">{points.length} response{points.length !== 1 ? 's' : ''}</p>
    </div>
  );
}

function Slider2DWidget({ pollId, poll, pollValues, pollResetSeq, onVote, onResetPoll, isPresenter, myVote, setMyVote }: PollWidgetProps & { poll: Extract<PollConfig, { type: 'slider2d' }> }) {
  const [svgPos, setSvgPos] = useState<[number, number]>(() => {
    if (myVote) { const parsed = parseBarySvg(myVote); if (parsed) return parsed; }
    return [200, TRI_H * (2 / 3)];
  });
  const [isDragging, setIsDragging] = useState(false);
  const hasVoted = myVote !== null;
  const svgRef = useRef<SVGSVGElement>(null);

  const prevResetSeq = useRef(pollResetSeq);
  useEffect(() => {
    if (pollResetSeq === prevResetSeq.current) return;
    prevResetSeq.current = pollResetSeq;
    setSvgPos([200, TRI_H * (2 / 3)]);
  }, [pollResetSeq]);

  const svgCoordsFromPointer = (clientX: number, clientY: number): [number, number] => {
    if (!svgRef.current) return svgPos;
    const pt = svgRef.current.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const inv = svgRef.current.getScreenCTM()?.inverse();
    if (!inv) return svgPos;
    const transformed = pt.matrixTransform(inv);
    return clampToTriangle(transformed.x, transformed.y);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isPresenter) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    setSvgPos(svgCoordsFromPointer(e.clientX, e.clientY));
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    setSvgPos(svgCoordsFromPointer(e.clientX, e.clientY));
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    const pos = svgCoordsFromPointer(e.clientX, e.clientY);
    setSvgPos(pos);
    const [w1, w2] = svgToBarycentric(pos[0], pos[1]);
    const encoded = `${w1.toFixed(4)},${w2.toFixed(4)}`;
    setMyVote(encoded);
    onVote(pollId, encoded, 'slider2d');
  };

  const showResults = isPresenter || (hasVoted && poll.showLiveResults);
  const [bx, by] = svgToBarycentric(svgPos[0], svgPos[1]);
  const bz = 1 - bx - by;

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-white text-xl font-bold leading-snug">{poll.question}</h3>
      {showResults ? (
        <Slider2DResults values={pollValues} labels={poll.labels} />
      ) : (
        <div className="flex flex-col gap-3 items-center select-none">
          <svg
            ref={svgRef}
            viewBox={`-100 -80 ${TRI_W + 200} ${TRI_H + 160}`}
            className={['w-full max-w-xs', isPresenter ? 'opacity-50' : 'cursor-crosshair'].join(' ')}
            style={{ overflow: 'visible', touchAction: 'none', userSelect: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <polygon
              points={V.map(v => v.join(',')).join(' ')}
              fill="rgba(99,102,241,0.08)"
              stroke="rgba(99,102,241,0.4)"
              strokeWidth="2"
            />
            {/* Dashed guide lines from vertices to point */}
            {V.map(([vx, vy], i) => (
              <line key={i} x1={vx} y1={vy} x2={svgPos[0]} y2={svgPos[1]}
                stroke="rgba(99,102,241,0.2)" strokeWidth="1" strokeDasharray="4,4" />
            ))}
            {/* Vertex labels */}
            {poll.labels.map((label, i) => {
              const [vx, vy] = V[i];
              const offsets: [number, number][] = [[0, -30], [-30, 36], [30, 36]];
              const weights = [bx, by, bz];
              return (
                <text key={i} x={vx + offsets[i][0]} y={vy + offsets[i][1]} textAnchor="middle" fill="#94a3b8" fontSize="36" fontWeight="600">
                  {label}
                  <tspan fill="#6366f1" fontSize="26" dy="0"> {Math.round(weights[i] * 100)}%</tspan>
                </text>
              );
            })}
            {/* Draggable point */}
            <circle
              cx={svgPos[0]} cy={svgPos[1]}
              r={isDragging ? 12 : 10}
              fill="#6366f1"
              stroke="white"
              strokeWidth="2.5"
            />
          </svg>
          {!isPresenter && (
            <p className="text-slate-500 text-xs text-center">
              {hasVoted ? 'Response recorded · drag to update' : 'Drag to position, release to submit'}
            </p>
          )}
        </div>
      )}
      {isPresenter && <ResetButton onReset={() => onResetPoll(pollId)} />}
    </div>
  );
}
