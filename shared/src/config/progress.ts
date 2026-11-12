// Upgrades, trails, the Shop, the Pet Index, selling and fusing. All balance numbers live here.

import type { Rarity } from "./eggs.ts";
import type { ToolKind } from "./items.ts";
import { HATCH, MUTATIONS, PET_BY_ID, petIncome } from "./pets.ts";
import { BIOMES } from "./world.ts";

// ---------------------------------------------------------------- pen levels (fence tiers)

export interface PenLevel {
  level: number;
  name: string;
  /** Fence rail / post colors. */
  rail: string;
  post: string;
  /** Extra income for pets in this pen (0.1 = +10%). */
  incomeBonus: number;
  /** Money cost to upgrade TO this level. */
  cost: number;
}

/** Reference: a new pen is white; upgrading turns it wooden. We keep going from there. */
export const PEN_LEVELS: PenLevel[] = [
  { level: 1, name: "Белая ограда", rail: "#f4f4f6", post: "#4b4550", incomeBonus: 0, cost: 0 },
  { level: 2, name: "Деревянная ограда", rail: "#b86b2e", post: "#5a3a22", incomeBonus: 0.1, cost: 2_500 },
  { level: 3, name: "Каменная ограда", rail: "#9aa0ab", post: "#4a4f5a", incomeBonus: 0.25, cost: 60_000 },
  { level: 4, name: "Золотая ограда", rail: "#ffc21f", post: "#8a6a10", incomeBonus: 0.5, cost: 1_500_000 },
  { level: 5, name: "Алмазная ограда", rail: "#7fe8ff", post: "#2a6f9a", incomeBonus: 1, cost: 40_000_000 },
];

export function penLevel(level: number): PenLevel {
  return PEN_LEVELS[Math.max(0, Math.min(PEN_LEVELS.length - 1, level - 1))];
}

// ---------------------------------------------------------------- trails

export interface TrailDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** Movement speed multiplier while equipped. */
  speedMult: number;
  color: string;
  /** Money price (0 = free / starter). */
  price: number;
}

export const TRAILS: TrailDef[] = [
  { id: "grey", name: "Серый след", rarity: "Common", speedMult: 1.1, color: "#c9ccd3", price: 2_000 },
  { id: "green", name: "Зелёный след", rarity: "Uncommon", speedMult: 1.2, color: "#5ee04a", price: 20_000 },
  { id: "blue", name: "Синий след", rarity: "Rare", speedMult: 1.35, color: "#2f9bff", price: 250_000 },
  { id: "purple", name: "Фиолетовый след", rarity: "Epic", speedMult: 1.5, color: "#c04dff", price: 3_000_000 },
  { id: "fire", name: "Огненный след", rarity: "Legendary", speedMult: 1.75, color: "#ff7a1a", price: 50_000_000 },
  { id: "rainbow", name: "Радужный след", rarity: "Mythic", speedMult: 2, color: "#ff5ec8", price: 1_000_000_000 },
];

export const TRAIL_BY_ID = new Map(TRAILS.map((t) => [t.id, t]));

export function trailMult(id: string): number {
  return TRAIL_BY_ID.get(id)?.speedMult ?? 1;
}

// ---------------------------------------------------------------- selling and fusing

/** A pet sells for its $/s times this. Reference: a $1/s pet sells for $100. */
export const SELL_MULT = 100;

/** An egg sells for this × the $/s its average hatch would earn — a sure thing, but less than hatching it and selling the pet. */
export const EGG_SELL_MULT = 50;

/** Sale price of an unhatched egg of this size. */
export function eggSellValue(eggDefId: string, size: number): number {
  const pool = HATCH[eggDefId]?.pets ?? [];
  const total = pool.reduce((a, [, w]) => a + w, 0) || 1;
  // Expected hatch weight is baseWeight × size × 1.025 (the middle of rollWeight's 0.8–1.25 range).
  const avgIncome = pool.reduce((a, [id, w]) => {
    const pet = PET_BY_ID.get(id)!;
    return a + (w / total) * petIncome(pet, pet.baseWeight * size * 1.025, "");
  }, 0);
  return Math.max(1, Math.round(avgIncome * EGG_SELL_MULT));
}

/**
 * Fusion Machine: 3 pets of one species (from the inventory) + a fee → 1 egg of that species, which hatches
 * normally. It's a reroll, not a guaranteed upgrade: weight and mutation are rolled fresh, only the species is kept.
 */
export const FUSE = {
  /** How many pets of the same species go in. */
  inputs: 3,
  /** Output weight = average input weight × a random factor in this range. */
  weightRoll: { min: 0.75, max: 1.35 },
  /** Allowed output weight for a species, as multiples of its base weight. */
  weightLimits: { min: 0.5, max: 100 },
  /** Fresh mutation roll for the output (the rest is Normal). */
  mutationChances: { golden: 0.04, rainbow: 0.004 } as Record<string, number>,
  /** Added once to a mutation's chance when all three inputs have it — the only way inputs sway the roll. */
  sameMutationBonus: 0.02,
  /** Fee by species id; species not listed fall back to their rarity (× biome), then to `defaultFee`. */
  feeBySpecies: { forest_chick: 1_000, forest_fox: 2_500, forest_bear: 5_000 } as Record<string, number>,
  feeByRarity: { Common: 1_000, Uncommon: 2_500, Rare: 5_000, Epic: 15_000, Legendary: 50_000, Mythic: 250_000, Secret: 1_000_000 } as Record<string, number>,
  /** Rarity fees grow this much per biome down the corridor. */
  biomeFeeMult: 1.6,
  defaultFee: 1_000,
} as const;

/** The fee to fuse three pets of this species (recomputed by the server when you confirm). */
export function fusionFee(species: string): number {
  const pet = PET_BY_ID.get(species);
  if (FUSE.feeBySpecies[species] !== undefined) return FUSE.feeBySpecies[species];
  const base = pet ? FUSE.feeByRarity[pet.rarity] : undefined;
  if (base === undefined || !pet) return FUSE.defaultFee;
  const tier = Math.max(0, BIOMES.findIndex((b) => b.id === pet.biome));
  return Math.round(base * FUSE.biomeFeeMult ** tier);
}

/** Output weight: the inputs' average × a random factor, kept within the species' limits. */
export function rollFusionWeight(species: string, inputWeights: number[], rnd: number): number {
  const pet = PET_BY_ID.get(species)!;
  const avg = inputWeights.reduce((a, w) => a + w, 0) / inputWeights.length;
  const w = avg * (FUSE.weightRoll.min + rnd * (FUSE.weightRoll.max - FUSE.weightRoll.min));
  return +Math.min(pet.baseWeight * FUSE.weightLimits.max, Math.max(pet.baseWeight * FUSE.weightLimits.min, w)).toFixed(1);
}

/** Output mutation: a fresh roll, rarest first; all three inputs sharing a mutation adds `sameMutationBonus` to it once. */
export function rollFusionMutation(inputMutations: string[], rnd: number): string {
  const shared = inputMutations[0] && inputMutations.every((m) => m === inputMutations[0]) ? inputMutations[0] : "";
  let acc = 0;
  for (const m of MUTATIONS) {
    acc += (FUSE.mutationChances[m.id] ?? 0) + (m.id === shared ? FUSE.sameMutationBonus : 0);
    if (rnd < acc) return m.id;
  }
  return "";
}

// ---------------------------------------------------------------- Pet Index

/** Discovery rewards per rarity: [money multiplier of the pet's $/s, Speed stat]. Claimed once per species. */
export const INDEX_REWARD: Record<Rarity, { incomeMult: number; speed: number }> = {
  Common: { incomeMult: 100, speed: 100 },
  Uncommon: { incomeMult: 100, speed: 300 },
  Rare: { incomeMult: 120, speed: 1_000 },
  Epic: { incomeMult: 150, speed: 5_000 },
  Legendary: { incomeMult: 200, speed: 25_000 },
  Mythic: { incomeMult: 250, speed: 150_000 },
  Secret: { incomeMult: 300, speed: 500_000 },
};

/** Completing a biome page (every pet discovered): Gems + one extra pen slot. */
export const INDEX_COMPLETE_REWARD = { gems: 50, slots: 1 } as const;

// ---------------------------------------------------------------- Shop (priced in Gems)

/** Limited-time Featured egg (reference: a big event egg with drop odds and bundles). */
export const FEATURED = {
  eggId: "limited_nugget",
  /** Event ends at this date (ms since epoch). */
  endsAt: Date.UTC(2026, 10, 30),
  bundles: [
    { count: 1, gems: 25 },
    { count: 3, gems: 65 },
    { count: 10, gems: 200, was: 250 },
  ],
} as const;

export interface ShopItem {
  id: string;
  tab: "speed" | "money" | "gear";
  title: string;
  desc: string;
  icon: string;
  gems: number;
  /** When set, the item is bought with money instead of gems. */
  cash?: number;
  /** What it gives. */
  speedBoostMin?: number;
  speed?: number;
  /** Money = max(flat, your $/s × incomeSeconds). */
  money?: { flat: number; incomeSeconds: number };
  /** Tool items, stored like any new item: first free hotbar slot, else the inventory. */
  tool?: { kind: ToolKind; qty: number };
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: "boost10", tab: "speed", title: "Скорость ×2 (10 мин)", desc: "Дорожка даёт вдвое больше скорости 10 минут.", icon: "⚡", gems: 15, speedBoostMin: 10 },
  { id: "boost60", tab: "speed", title: "Скорость ×2 (1 час)", desc: "Дорожка даёт вдвое больше скорости один час.", icon: "⚡", gems: 60, speedBoostMin: 60 },
  { id: "speed5k", tab: "speed", title: "+5 тыс. скорости", desc: "Мгновенная прибавка к скорости.", icon: "👟", gems: 20, speed: 5_000 },
  { id: "cash1", tab: "money", title: "Стопка денег", desc: "10 тыс. монет или твой доход за 10 минут, если он выше.", icon: "💵", gems: 20, money: { flat: 10_000, incomeSeconds: 600 } },
  { id: "cash2", tab: "money", title: "Мешок денег", desc: "100 тыс. монет или твой доход за час, если он выше.", icon: "💰", gems: 90, money: { flat: 100_000, incomeSeconds: 3_600 } },
  { id: "cash3", tab: "money", title: "Хранилище денег", desc: "1 млн монет или твой доход за 8 часов, если он выше.", icon: "🏦", gems: 400, money: { flat: 1_000_000, incomeSeconds: 28_800 } },
  { id: "bat", tab: "gear", title: "Меч", desc: "Выбивает капсулу из рук вора или оглушает охранника.", icon: "🗡️", gems: 25, tool: { kind: "bat", qty: 1 } },
  { id: "trap3", tab: "gear", title: "Капканы ×3", desc: "Поставь в биоме. Тот, кто наступит, застрянет и уронит капсулу.", icon: "🪤", gems: 0, cash: 1_000, tool: { kind: "trap", qty: 3 } },
  { id: "trap10", tab: "gear", title: "Капканы ×10", desc: "Большой набор капканов.", icon: "🪤", gems: 0, cash: 3_000, tool: { kind: "trap", qty: 10 } },
];

export const SHOP_BY_ID = new Map(SHOP_ITEMS.map((s) => [s.id, s]));

/** Treadmill Speed multiplier while a boost is active. */
export const SPEED_BOOST_MULT = 2;
