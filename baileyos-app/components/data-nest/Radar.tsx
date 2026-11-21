'use client';

export function Radar({ blips }: { blips: { id: string; bearing: number; distanceKm: number }[] }) {
  return (
    <figure className="relative overflow-hidden rounded-3xl border border-cyan-400/30 bg-[#07111f] p-3">
      <figcaption className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-cyan-200">
        <span>Quakes</span>
        <span className="rounded-full border border-cyan-300/50 px-2 py-1 text-cyan-100">Live USGS</span>
      </figcaption>
      <div className="relative mx-auto mt-3 h-64 w-64">
        <svg viewBox="0 0 100 100" className="h-full w-full">
          {[18, 32, 46].map((r) => <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#155e75" strokeWidth="0.4" />)}
          <line x1="50" y1="4" x2="50" y2="96" stroke="#155e75" strokeWidth="0.3" />
          <line x1="4" y1="50" x2="96" y2="50" stroke="#155e75" strokeWidth="0.3" />
          {blips.map((blip) => {
            const rad = (blip.bearing - 90) * Math.PI / 180;
            const reach = Math.min(44, 8 + blip.distanceKm / 4);
            return <circle key={blip.id} cx={50 + Math.cos(rad) * reach} cy={50 + Math.sin(rad) * reach} r="1.8" fill="#22d3ee" />;
          })}
        </svg>
      </div>
      <p className="text-sm text-slate-300">{blips.length ? 'Cyan dots are published USGS earthquakes relative to this phone.' : 'No published earthquakes in this area. This is not an all-clear.'}</p>
    </figure>
  );
}
