interface WelcomeRoomProps {
  name: string;
}

export function WelcomeRoom({ name }: WelcomeRoomProps) {
  return (
    <div className="w-screen h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
        <p className="text-slate-200 text-2xl font-bold tracking-tight">Welcome to the Ideometer</p>
        <p className="text-slate-400 text-sm">
          Hi {name} — you're not assigned to a specific workshop room yet.
          Ask your host to send you an invitation.
        </p>
      </div>
    </div>
  );
}
