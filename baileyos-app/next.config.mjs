/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  async headers() {
    return [
      { source: '/api/placements', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      { source: '/api/brew/q/001/verify', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      { source: '/api/brew/q/001/results', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      { source: '/brew/q/001/verify', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};
