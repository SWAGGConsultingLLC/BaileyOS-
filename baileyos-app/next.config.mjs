/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  experimental: {
    outputFileTracingIncludes: {
      '/api/data-nest/validate': ['./api/**/*', './validation/freshness_limits.json', './validation/sample_input.json', './vendor/python/**/*'],
      '/api/data-nest/consensus': ['./api/**/*', './validation/freshness_limits.json', './vendor/python/**/*'],
      '/api/data-nest/verify': ['./api/**/*', './vendor/python/**/*'],
      '/api/data-nest/anchor': ['./api/**/*', './vendor/python/**/*'],
      '/api/data-nest/continuity': ['./api/**/*', './vendor/python/**/*'],
      '/landing-stone': ['./public/landing-stone/index.html'],
      '/api/landing-stone/slots': ['./validation/voter_slots.json'],
      '/api/data-nest/gemini': ['./api/**/*', './vendor/python/**/*'],
    },
  },
  async headers() {
    return [
      { source: '/api/placements', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      { source: '/api/brew/q/001/verify', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      { source: '/api/brew/q/001/results', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      { source: '/brew/q/001/verify', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};
