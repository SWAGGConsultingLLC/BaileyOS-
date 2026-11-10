import React from 'react';

/** The supplied 360° Brewing mark. Never larger than the 200px original. */
export function BrewLogo({ size = 96 }: { size?: number }) {
  const px = Math.min(Math.max(size, 1), 200);
  return (
    <img
      src="/brew/360-brewing-logo.png"
      alt="360° Brewing"
      width={px}
      height={px}
      style={{ width: px, height: px, maxWidth: 200, maxHeight: 200 }}
    />
  );
}
