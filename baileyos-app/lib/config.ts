const n = (v: string | undefined, d: number) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

export const CONFIG = {
  origin: {
    lat: n(process.env.NEXT_PUBLIC_ORIGIN_LAT, 39.0639),
    lon: n(process.env.NEXT_PUBLIC_ORIGIN_LON, -108.5506)
  },
  maxKm: n(process.env.NEXT_PUBLIC_MAX_KM, 50),
  bandKm: n(process.env.NEXT_PUBLIC_BAND_KM, 5),
  sectorDeg: n(process.env.NEXT_PUBLIC_SECTOR_DEG, 30),
  maxAccuracyM: 1000,
  clientSkewMs: 15 * 60 * 1000
};
export const SECTORS = Math.round(360 / CONFIG.sectorDeg);
