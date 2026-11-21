'use client';

export function Swarm({ rows }: { rows: { id: string; status: string; detail: string }[] }) {
  return (
    <section className="rounded-3xl border border-cyan-400/30 bg-[#07111f] p-3">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-cyan-200">Feed status</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl border border-slate-800 px-3 py-2">
            <span className="font-semibold text-white">{row.id}</span>
            <span className="text-slate-300"> · {row.status}. {row.detail}</span>
          </li>
        ))}
        {!rows.length && <li className="text-slate-300">No feed has been requested yet. This is not an all-clear.</li>}
      </ul>
    </section>
  );
}
