import React from 'react';
import { BrewLogo } from '@/components/BrewLogo';
import { BREWING_PLACE_LINE, MISSION_PATH } from '@/lib/brew/question001';

/** Logo beside the sign-in control, with the brewing page line underneath. */
export function BrewLockup({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <BrewLogo size={72} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <p className="mt-2 text-sm leading-6 text-gray-200">{BREWING_PLACE_LINE}</p>
      <a className="inline-flex min-h-11 items-center text-sm font-semibold text-cyan-300 underline" href={MISSION_PATH}>Our principle</a>
    </div>
  );
}
