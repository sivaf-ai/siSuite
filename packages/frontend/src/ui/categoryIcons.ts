/**
 * categoryIcons.ts — palette curata di icone lucide-react per le CATEGORIE articolo.
 * Mappa { kebabName -> LucideIcon } + helper <CategoryIcon> per renderizzare per nome
 * (con colore opzionale, fallback 'folder'). Usata da IconPicker e dall'albero categorie.
 * Niente colori hard-coded: il colore arriva dal dato (campo color della categoria).
 */
import { createElement } from 'react';
import {
  Package, Boxes, Cable, Plug, Wrench, Cpu, HardDrive, BatteryFull, Wifi, Router,
  Box, Tag, Folder, Layers, Bolt, Hammer, Ruler, Truck, Warehouse, Shield,
  FlaskConical, PaintRoller, Thermometer, Droplet, Flame, Snowflake, Sun, PlugZap,
  Antenna, Cog, Scissors, Key, Lightbulb, Monitor, Smartphone, Camera, Speaker, Lock,
  Wind, Pipette,
  icons as LUCIDE,
  type LucideIcon,
} from 'lucide-react';

const LUCIDE_MAP = LUCIDE as unknown as Record<string, LucideIcon>;

/** Palette curata (~40) di icone per le categorie articolo. Chiave = kebabName salvato sul DTO. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  package: Package,
  boxes: Boxes,
  cable: Cable,
  plug: Plug,
  wrench: Wrench,
  cpu: Cpu,
  'hard-drive': HardDrive,
  battery: BatteryFull,
  wifi: Wifi,
  router: Router,
  box: Box,
  tag: Tag,
  folder: Folder,
  layers: Layers,
  bolt: Bolt,
  screwdriver: Wrench,
  hammer: Hammer,
  ruler: Ruler,
  truck: Truck,
  warehouse: Warehouse,
  shield: Shield,
  'flask-conical': FlaskConical,
  'paint-roller': PaintRoller,
  pipe: Pipette,
  thermometer: Thermometer,
  droplet: Droplet,
  flame: Flame,
  snowflake: Snowflake,
  sun: Sun,
  'plug-zap': PlugZap,
  antenna: Antenna,
  cog: Cog,
  scissors: Scissors,
  key: Key,
  lightbulb: Lightbulb,
  monitor: Monitor,
  smartphone: Smartphone,
  camera: Camera,
  speaker: Speaker,
  lock: Lock,
  fan: Wind,
};

/** Lista ordinata dei nomi curati (palette di default del picker). */
export const CATEGORY_ICON_NAMES: string[] = Object.keys(CATEGORY_ICONS);

/** TUTTE le icone lucide (~1500), nomi PascalCase — per la ricerca testuale nel picker. */
export const ALL_ICON_NAMES: string[] = Object.keys(LUCIDE_MAP);

const pascalize = (s: string): string => s.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');

/** Risolve un nome icona → componente lucide. Accetta sia i kebab curati sia
 *  qualunque icona lucide (PascalCase o kebab). Fallback 'folder'. */
export function resolveCategoryIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Folder;
  return CATEGORY_ICONS[name] || LUCIDE_MAP[name] || LUCIDE_MAP[pascalize(name)] || Folder;
}

/** Ricerca icone per testo descrittivo (es. "neve", no — i nomi lucide sono in inglese:
 *  "snow", "drive", "truck"…). Match su nome normalizzato (senza separatori). Cap a `limit`. */
export function searchIcons(query: string, limit = 120): string[] {
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!q) return [];
  const out: string[] = [];
  for (const name of ALL_ICON_NAMES) {
    if (name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(q)) { out.push(name); if (out.length >= limit) break; }
  }
  return out;
}

/** Renderizza l'icona di categoria per nome, con dimensione e colore opzionali. */
export function CategoryIcon({ name, size = 16, color }: { name: string | null | undefined; size?: number; color?: string | null }) {
  const Ico = resolveCategoryIcon(name);
  return createElement(Ico, { size, ...(color ? { color } : {}) });
}
