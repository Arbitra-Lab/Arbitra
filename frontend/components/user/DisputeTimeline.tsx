export default function DisputeTimeline({
  events,
}: {
  events: { action: string; date: string; actor: string }[];
}) {
  return (
    <div className="border-l border-white/20 ml-4 py-2 space-y-4">
      {events.map((e, idx) => (
        <div key={idx} className="relative pl-6">
          <div className="absolute top-1 -left-1.5 w-3 h-3 rounded-full bg-brand-accent shadow-[0_0_8px_rgb(45,212,191)]"></div>
          <p className="text-white text-sm font-medium">{e.action}</p>
          <p className="text-xs text-slate-400">
            {e.date} • {e.actor}
          </p>
        </div>
      ))}
    </div>
  );
}
