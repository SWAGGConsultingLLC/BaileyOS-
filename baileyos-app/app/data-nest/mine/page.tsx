import type { Metadata } from 'next';
import { MyNest } from '@/components/data-nest/MyNest';

export const metadata: Metadata = {
  title: 'Your nest',
  description: 'Pull live feeds into your nest. Nothing is fetched on a schedule.',
};

export default function MyNestPage() {
  return <MyNest />;
}
