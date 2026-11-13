import type { Metadata } from 'next';

export const MAP_TITLE = 'BaileyOS by SWAGG Consulting';
export const MAP_DESCRIPTION = 'BaileyOS is the neighborhood map from SWAGG Consulting. Sign in and check in to see pins in your neighborhood, and add your voice to Question #001 in 360° Brewing.';
export const MAP_IMAGE_PATH = '/brew/question-001.png?v=2';

const PUBLIC_HOSTS = new Set([
  'baileyos-app.vercel.app',
  '360degreebrewing.swaggconsulting.com',
]);
const FALLBACK_ORIGIN = 'https://baileyos-app.vercel.app';

export function mapOrigin(hostHeader: string | null | undefined): string {
  const host = (hostHeader || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  return PUBLIC_HOSTS.has(host) ? `https://${host}` : FALLBACK_ORIGIN;
}

export function mapSocialMetadata(input: { host?: string | null; path: '/' | '/suite' }): Metadata {
  const origin = mapOrigin(input.host);
  const pageUrl = input.path === '/' ? `${origin}/` : `${origin}/suite`;
  const image = `${origin}${MAP_IMAGE_PATH}`;
  return {
    title: MAP_TITLE,
    description: MAP_DESCRIPTION,
    openGraph: {
      title: MAP_TITLE,
      description: MAP_DESCRIPTION,
      type: 'website',
      url: pageUrl,
      siteName: 'BaileyOS',
      images: [{ url: image, width: 1200, height: 627, alt: '360° Brewing' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: MAP_TITLE,
      description: MAP_DESCRIPTION,
      images: [image],
    },
  };
}
