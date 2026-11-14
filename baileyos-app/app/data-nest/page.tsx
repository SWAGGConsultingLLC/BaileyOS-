import type { Metadata } from 'next';
import { DataNestApp } from '@/components/data-nest/DataNestApp';

export const metadata: Metadata = {
  title: 'Data Nest',
  description: 'Live weather, road and safety alerts for where you are.',
};

export default function DataNestPage() {
  return <DataNestApp />;
}
