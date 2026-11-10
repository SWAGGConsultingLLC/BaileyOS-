import React from 'react';

export const MAP_HOME = 'https://baileyos-app.vercel.app/';

export function BackToMap() {
  return (
    <a className="mt-4 inline-flex min-h-12 items-center font-semibold text-cyan-300 underline" href={MAP_HOME}>Back to map</a>
  );
}
