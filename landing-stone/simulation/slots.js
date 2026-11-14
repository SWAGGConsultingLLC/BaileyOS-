/**
 * Slot registry. Tier is a config field. This file does not state a price.
 * Free-tier slots are ordered before paid slots. A paid slot stays out until
 * enabled is true and its env key is present. A missing key is "not configured".
 */
import registryFile from "./slots.json" with { type: "json" };
import sharedDocument from "./shared-document.json" with { type: "json" };

export const SHARED_DOCUMENT = sharedDocument;
export const SLOT_REGISTRY = registryFile.slots;
export const QUORUM_SIZE = registryFile.quorum;

export function orderedSlots(slots = SLOT_REGISTRY) {
  const free = slots.filter((slot) => slot.tier === "free");
  const paid = slots.filter((slot) => slot.tier === "paid");
  return free.concat(paid);
}

export function slotStatus(slot, envHasKey) {
  if (!slot.enabled) return "disabled";
  if (slot.env && !envHasKey) return "not configured";
  return "ready";
}

export function publicSlot(slot, envHasKey) {
  const status = slotStatus(slot, envHasKey);
  return {
    id: slot.id,
    name: slot.name,
    tier: slot.tier,
    enabled: slot.enabled === true,
    optional: slot.optional === true,
    placeholder: slot.placeholder === true,
    status,
  };
}

export function slotRole(slot) {
  return `You are ${slot.name}. Read the shared document ${SHARED_DOCUMENT.id}. Follow it. Do not invent a vote, a key, or a price.`;
}
