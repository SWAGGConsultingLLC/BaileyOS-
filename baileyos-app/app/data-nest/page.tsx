import type { Metadata } from 'next';
import { DataNestApp } from '@/components/data-nest/DataNestApp';

export const metadata: Metadata = {
  title: 'Data Nest',
  description: 'Local overwatch for Grand Junction and the I-70 corridor. Sign in to use location, live feeds, and the Queen.',
};

export default function DataNestPage() {
  return <DataNestApp />;
}
