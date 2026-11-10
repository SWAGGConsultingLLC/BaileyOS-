import type { Metadata } from 'next';
import { headers } from 'next/headers';
import MapHome from '@/components/MapHome';
import { mapSocialMetadata } from '@/lib/mapPreview';

export async function generateMetadata(): Promise<Metadata> {
  const request = headers();
  return mapSocialMetadata({
    host: request.get('x-forwarded-host') ?? request.get('host'),
    path: '/',
  });
}

export default function Page() {
  return <MapHome />;
}
