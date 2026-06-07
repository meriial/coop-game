import { useEffect, useState } from 'react';
import { Volume2, VolumeX, Presentation, User } from 'lucide-react';
import { presentationSteps, stepHasSound } from './config/presentationConfig';
import type { WsState } from './hooks/useWebSocket';
import { StageRenderer } from './components/StageRenderer';
import { useSoundContext } from './contexts/SoundContext';

interface Props {
  state: WsState;
  send: (msg: Record<string, unknown> & { type: string }) => void;
  myName: string;
  myOwner: string;
  token: string | null;
  onToggleDevRole?: () => void;
}

export function PresenterApp({ state, send, myName, myOwner, token, onToggleDevRole }: Props) {
  const step = presentationSteps[state.stepIndex] ?? presentationSteps[0];
  const isGame = step.type === 'game';
  const { muted, toggleMute } = useSoundContext();
  const total = presentationSteps.length;
  const [usersOpen, setUsersOpen] = useState(false);
  const [inviteOpen, setInviteOpen]     = useState(false);
  const [inviteEmail, setInviteEmail]   = useState('');
  const [inviteName, setInviteName]     = useState('');
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [inviteError, setInviteError]   = useState('');
  const [inviteLink, setInviteLink]     = useState('');

  const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? window.location.origin;

  const closeInviteModal = () => {
    setInviteOpen(false);
    setInviteEmail(''); setInviteName('');
    setInviteStatus('idle'); setInviteError(''); setInviteLink('');
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteName.trim()) return;
    setInviteStatus('loading'); setInviteError(''); setInviteLink('');
    try {
      const res = await fetch(`${SERVER_URL}/auth/guest-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token ?? ''}` },
        body: JSON.stringify({ email: inviteEmail.trim(), name: inviteName.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setInviteStatus('error');
        setInviteError(data.error ?? `Server error ${res.status}`);
        return;
      }
      const data = (await res.json()) as { link?: string };
      const rawToken = data.link ? new URL(data.link).searchParams.get('token') ?? '' : '';
      setInviteLink(rawToken ? `${window.location.origin}/?token=${rawToken}` : '');
      setInviteStatus('success');
    } catch {
      setInviteStatus('error');
      setInviteError('Network error — is the server running?');
    }
  };

  const goTo = (idx: number) => {
    const clamped = Math.max(0, Math.min(total - 1, idx));
    send({ type: 'STEP_CHANGE', stepIndex: clamped });
  };

  useEffect(() => {
    if (isGame) return; // disable global keys during game
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goTo(state.stepIndex + 1);
      if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   goTo(state.stepIndex - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.stepIndex, isGame]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-screen h-screen bg-slate-950 overflow-hidden relative flex flex-col">
      {/* Main stage */}
      <div className="flex-1 overflow-hidden relative">
        <StageRenderer wsState={state} send={send} isPresenter myName={myName} myOwner={myOwner} />
        {/* Name badge + optional sound toggle */}
        <div className="absolute top-3 right-4 flex items-center gap-2 z-50">
          {stepHasSound(step) && (
            <button
              onClick={toggleMute}
              className={`flex items-center justify-center w-7 h-7 rounded-full bg-slate-900/80 backdrop-blur-sm border transition-colors ${muted ? 'border-slate-700/40 text-slate-600 hover:text-slate-400' : 'border-slate-700/60 text-slate-400 hover:text-slate-200'}`}
              title={muted ? 'Unmute sounds' : 'Mute sounds'}
            >
              {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>
          )}
          {onToggleDevRole && (
            <button
              onClick={onToggleDevRole}
              className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-900/80 backdrop-blur-sm border border-amber-500/50 text-amber-400 hover:text-amber-300 hover:border-amber-400 transition-colors"
              title="DEV: Switch to participant view"
            >
              <User size={13} />
            </button>
          )}
          <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 px-3 py-1.5 rounded-full text-xs text-slate-300 pointer-events-none">
            {myName}
          </div>
        </div>
      </div>

      {/* Presenter control bar */}
      <div className="relative z-[100] flex items-center justify-between px-6 py-3 bg-slate-900 border-t border-slate-700/60 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-indigo-400 text-xs font-semibold uppercase tracking-widest">Presenter</span>
          <span className="text-slate-500 text-xs">·</span>
          <span className="text-slate-400 text-xs">{myName}</span>
          <button
            onClick={() => setUsersOpen(o => !o)}
            className="ml-2 flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1 rounded-full text-xs text-slate-300 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            {state.connectedUsers.length} connected
          </button>
          <button
            onClick={() => setInviteOpen(true)}
            className="ml-1 flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1 rounded-full text-xs text-slate-300 transition-colors"
          >
            + Invite
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => goTo(state.stepIndex - 1)}
            disabled={state.stepIndex === 0}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-slate-400 text-sm font-mono">
            {state.stepIndex + 1} / {total}
          </span>
          <button
            onClick={() => goTo(state.stepIndex + 1)}
            disabled={state.stepIndex === total - 1}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 border border-indigo-500 text-white text-sm hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>

        <div className="text-slate-500 text-xs hidden sm:block">
          {isGame ? 'Game active — arrow keys disabled' : '← → or PageUp/Down to navigate'}
        </div>
      </div>

      {/* Connected users drawer */}
      {usersOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setUsersOpen(false)}
        />
      )}
      <div className={[
        'fixed bottom-[52px] left-6 z-50 bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl w-64 transition-all duration-200 origin-bottom-left',
        usersOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none',
      ].join(' ')}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60">
          <span className="text-white text-sm font-semibold">Connected</span>
          <span className="text-slate-400 text-xs">{state.connectedUsers.length} user{state.connectedUsers.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="max-h-64 overflow-y-auto py-2">
          {state.connectedUsers.length === 0 ? (
            <p className="text-slate-500 text-xs px-4 py-2">No users connected</p>
          ) : (
            state.connectedUsers.map((u, i) => (
              <div key={i} className="flex items-center gap-2.5 px-4 py-2 hover:bg-slate-800/50">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: u.color ?? '#64748b' }}
                />
                <span className="text-slate-300 text-sm truncate">{u.name}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Invite guest modal */}
      {inviteOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
          onClick={closeInviteModal}
        >
          <div
            className="bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4 mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold text-base">Invite Guest</h2>
              <button
                onClick={closeInviteModal}
                className="text-slate-500 hover:text-slate-300 text-lg leading-none transition-colors"
              >
                ✕
              </button>
            </div>

            {inviteStatus !== 'success' ? (
              <>
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="text-slate-400 text-xs mb-1 block">Guest name</label>
                    <input
                      type="text"
                      placeholder="Jane Smith"
                      value={inviteName}
                      onChange={e => setInviteName(e.target.value)}
                      disabled={inviteStatus === 'loading'}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-xs mb-1 block">Guest email</label>
                    <input
                      type="email"
                      placeholder="guest@example.com"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      disabled={inviteStatus === 'loading'}
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    />
                  </div>
                </div>

                {inviteStatus === 'error' && (
                  <p className="text-red-400 text-xs">{inviteError}</p>
                )}

                <button
                  onClick={handleInvite}
                  disabled={inviteStatus === 'loading' || !inviteEmail.trim() || !inviteName.trim()}
                  className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {inviteStatus === 'loading' ? 'Sending…' : 'Send Invite'}
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-emerald-400 text-sm font-medium">Invite sent to {inviteEmail}!</p>
                {inviteLink ? (
                  <>
                    <p className="text-slate-400 text-xs">Dev mode — copy and share this link:</p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={inviteLink}
                        className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 text-xs font-mono focus:outline-none"
                        onClick={e => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(inviteLink)}
                        className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs transition-colors shrink-0"
                      >
                        Copy
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-slate-400 text-xs">The guest will receive an email with a direct link to join.</p>
                )}
                <button
                  onClick={closeInviteModal}
                  className="mt-1 w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
