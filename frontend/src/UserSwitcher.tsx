import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { isJwtExpired, TOKEN_KEY } from './jwt';

interface DevUser {
  name: string;
  email: string;
  token: string;
  /** Worker the identity is authenticated against; distinguishes the same email across envs. */
  workerUrl?: string;
}

interface Props {
  myName: string;
  /** Email of the currently active identity (App's `myOwner`). */
  currentEmail: string;
}

/** Short, human-readable environment label for a worker URL (e.g. "local", a hostname). */
function envLabel(workerUrl?: string): string {
  if (!workerUrl) return '';
  try {
    const { hostname } = new URL(workerUrl);
    return hostname === 'localhost' || hostname === '127.0.0.1' ? 'local' : hostname;
  } catch {
    return workerUrl;
  }
}

/** The env the running dev server is currently pointed at (baked into VITE_SERVER_URL). */
const CURRENT_ENV = envLabel(import.meta.env.VITE_SERVER_URL as string | undefined);

/**
 * Top-right user pill. In dev, if a gitignored `frontend/dev-users.json` lists more than one
 * authenticated identity (populated by `dev.sh` / `setup.sh`), the pill becomes a dropdown for
 * switching. Each identity is tagged with its environment, so the same email logged into both
 * prod and local dev shows as two switchable entries. Selecting a user asks the dev server to
 * rewrite the token + URL env vars and restart, then reloads.
 * In production (or with <2 users) it renders the plain, non-interactive label — unchanged.
 */
export function UserSwitcher({ myName, currentEmail }: Props) {
  const [users, setUsers] = useState<DevUser[]>([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    fetch('/__dev_users')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setUsers(Array.isArray(d) ? (d as DevUser[]) : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const pillClass =
    'bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 px-3 py-1.5 rounded-full text-xs text-slate-300';

  // Single identity (or production build): keep the original read-only badge.
  if (users.length < 2) {
    return <div className={`${pillClass} pointer-events-none`}>{myName}</div>;
  }

  const switchTo = async (token: string) => {
    setOpen(false);
    setSwitching(true);
    try {
      await fetch('/__switch_user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    } catch {
      // Server may have already begun restarting; proceed to reload regardless.
    }
    // Critical: clear the stored token so getToken() falls through to the freshly-written env var.
    localStorage.removeItem(TOKEN_KEY);
    // Poll until the dev server is back up after its restart, then reload as the new user.
    const deadline = Date.now() + 15000;
    const poll = async () => {
      try {
        const r = await fetch('/', { cache: 'no-store' });
        if (r.ok) {
          location.reload();
          return;
        }
      } catch {
        // server still restarting
      }
      if (Date.now() < deadline) setTimeout(poll, 300);
      else location.reload();
    };
    setTimeout(poll, 600);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={switching}
        className={`${pillClass} flex items-center gap-1 hover:text-slate-100 hover:border-slate-600 transition-colors disabled:opacity-60`}
        title="Switch user"
      >
        {switching ? 'Switching…' : myName}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-56 bg-slate-900/95 backdrop-blur-sm border border-slate-700/60 rounded-lg shadow-xl overflow-hidden z-[200]">
          {users.map((u) => {
            const expired = isJwtExpired(u.token);
            const label = envLabel(u.workerUrl);
            // The same email can appear once per environment, so match on both.
            const isCurrent = u.email === currentEmail && label === CURRENT_ENV;
            return (
              <button
                key={`${u.email}::${u.workerUrl ?? ''}`}
                disabled={expired || isCurrent || switching}
                onClick={() => switchTo(u.token)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  expired ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-800'
                } ${isCurrent ? 'bg-slate-800/60' : ''}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-slate-200 truncate">
                    {u.name}
                    {expired ? ' (expired)' : ''}
                  </div>
                  <div className="text-slate-500 truncate">{u.email}</div>
                  {label && (
                    <span
                      title={u.workerUrl}
                      className="mt-1 inline-block max-w-full truncate align-middle text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400"
                    >
                      {label}
                    </span>
                  )}
                </div>
                {isCurrent && <Check size={13} className="text-emerald-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
