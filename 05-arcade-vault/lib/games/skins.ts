// Skins de los juegos reales. Cada motor con `skins: true` en el registro
// resuelve su paleta con estos ids (ver lib/games/<slug>/skins.ts).
export type SkinId = "clasico" | "neon" | "retro";
export const SKIN_IDS: readonly SkinId[] = ["clasico", "neon", "retro"];
export const SKIN_LABELS: Record<SkinId, string> = {
  clasico: "CLÁSICO",
  neon: "NEÓN",
  retro: "RETRO",
};
export const DEFAULT_SKIN: SkinId = "clasico";
export function isSkinId(value: unknown): value is SkinId {
  return typeof value === "string" && (SKIN_IDS as readonly string[]).includes(value);
}
