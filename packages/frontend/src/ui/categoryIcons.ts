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
  type LucideIcon,
} from 'lucide-react';

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

/** Lista ordinata dei nomi (per la griglia del picker). */
export const CATEGORY_ICON_NAMES: string[] = Object.keys(CATEGORY_ICONS);

/** Risolve un kebabName → componente lucide (fallback 'folder'). */
export function resolveCategoryIcon(name: string | null | undefined): LucideIcon {
  return (name && CATEGORY_ICONS[name]) || Folder;
}

/** Renderizza l'icona di categoria per nome, con dimensione e colore opzionali. */
export function CategoryIcon({ name, size = 16, color }: { name: string | null | undefined; size?: number; color?: string | null }) {
  const Ico = resolveCategoryIcon(name);
  return createElement(Ico, { size, ...(color ? { color } : {}) });
}
