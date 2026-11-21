import fs from 'node:fs';
import path from 'node:path';

export type SlotConfig = {
  id: string;
  name: string;
  tier: 'free' | 'paid';
  enabled: boolean;
  env?: string;
  placeholder?: boolean;
};

export type SlotView = {
  id: string;
  name: string;
  tier: 'free' | 'paid';
  enabled: boolean;
  status: 'disabled' | 'not configured' | 'ready';
};

export function loadSlotConfig(): { quorum: number; slots: SlotConfig[] } {
  const file = path.join(process.cwd(), 'validation', 'voter_slots.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')) as { quorum: number; slots: SlotConfig[] };
}

export function slotViews(slots: SlotConfig[], env: Record<string, string | undefined>): SlotView[] {
  const free = slots.filter((slot) => slot.tier === 'free');
  const paid = slots.filter((slot) => slot.tier === 'paid');
  return [...free, ...paid].map((slot) => {
    const present = Boolean(slot.env && (env[slot.env] || '').trim());
    const status = !slot.enabled ? 'disabled' : slot.env && !present ? 'not configured' : 'ready';
    return { id: slot.id, name: slot.name, tier: slot.tier, enabled: slot.enabled, status };
  });
}
