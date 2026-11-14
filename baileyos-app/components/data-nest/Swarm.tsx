'use client';

const NODES = [
  { id: 'guard', name: 'GUARD.LION', x: 18, y: 28 },
  { id: 'queen', name: 'QUEEN ANT AGGREGATOR', x: 78, y: 24 },
  { id: 'rooster', name: 'SIGNAL.ROOSTER', x: 80, y: 74 },
  { id: 'bear', name: 'ORIGIN.BEAR', x: 20, y: 76 },
];

export function Swarm({ overall }: { overall: string | null }) {
  return (
    <figure className="relative overflow-hidden rounded-3xl border border-cyan-400/30 bg-[#07111f] p-3">
      <figcaption className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-cyan-200">
        <span>Swarm</span>
        <span className="rounded-full border border-amber-300/60 px-2 py-1 text-amber-200">SIMULATED</span>
      </figcaption>
      <svg viewBox="0 0 100 100" className="mt-2 h-64 w-full" role="img" aria-label="Simulated swarm. A center node with four named nodes around it.">
        {NODES.map((node) => (
          <line key={node.id} x1="50" y1="50" x2={node.x} y2={node.y} stroke="#22d3ee" strokeOpacity="0.45" strokeWidth="0.6" />
        ))}
        <circle cx="50" cy="50" r="16" fill="none" stroke="#22d3ee" strokeOpacity="0.25" />
        <circle cx="50" cy="50" r="8" fill="#083044" stroke="#22d3ee" strokeWidth="1.2" />
        <text x="50" y="51" textAnchor="middle" fill="#e0f2fe" fontSize="3.2">VALIDATING</text>
        {NODES.map((node) => (
          <g key={node.id}>
            <circle cx={node.x} cy={node.y} r="7" fill="#0b1220" stroke="#67e8f9" strokeWidth="0.8" />
            <text x={node.x} y={node.y + 12} textAnchor="middle" fill="#a5f3fc" fontSize="2.6">{node.name}</text>
          </g>
        ))}
      </svg>
      <p className="text-sm text-slate-300">
        The links and pulse are a picture, not a live network.
        {overall ? ` Latest sample-file result: ${overall}. That is a check of the sample, not a verification of the highway.` : ' Run validation to check the sample file.'}
      </p>
    </figure>
  );
}
