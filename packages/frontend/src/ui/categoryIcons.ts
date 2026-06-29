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

/** Sinonimi IT/ES → EN per la ricerca icone con traduzione (STANDARD §6.9.1).
 *  La libreria lucide è in inglese: digitando "cavo"/"cable_es" troviamo "cable".
 *  Mappa una parola (lingua di lavoro) → uno o più termini inglesi da cercare. */
export const ICON_SYNONYMS: Record<string, string[]> = {
  // materiali / fibra / elettrico
  cavo: ['cable'], cavi: ['cable'], cable_es: ['cable'],
  connettore: ['plug', 'cable'], connettori: ['plug'], conector: ['plug'],
  spina: ['plug'], presa: ['plug-zap', 'plug'], enchufe: ['plug'],
  batteria: ['battery'], bateria: ['battery'],
  fibra: ['cable', 'antenna'], fibraottica: ['cable'],
  antenna: ['antenna'], router: ['router'], rete: ['wifi', 'router'], red: ['wifi'],
  wifi: ['wifi'], lampada: ['lightbulb'], lampadina: ['lightbulb'], luce: ['lightbulb', 'sun'], luz: ['lightbulb'],
  // attrezzi
  attrezzo: ['wrench', 'hammer'], attrezzi: ['wrench', 'hammer'], herramienta: ['wrench'],
  chiave: ['wrench', 'key'], chiaveinglese: ['wrench'], llave: ['wrench', 'key'],
  martello: ['hammer'], martillo: ['hammer'], cacciavite: ['screwdriver', 'wrench'],
  vite: ['bolt'], viti: ['bolt'], bullone: ['bolt'], tornillo: ['bolt'],
  forbici: ['scissors'], tijeras: ['scissors'], metro: ['ruler'], righello: ['ruler'], regla: ['ruler'],
  // contenitori / logistica
  scatola: ['box', 'package'], scatole: ['boxes'], caja: ['box'],
  pacco: ['package'], pacchi: ['boxes'], paquete: ['package'],
  magazzino: ['warehouse'], deposito: ['warehouse'], almacen: ['warehouse'],
  camion: ['truck'], furgone: ['truck'], trasporto: ['truck'], transporte: ['truck'],
  etichetta: ['tag'], etiqueta: ['tag'], cartella: ['folder'], carpeta: ['folder'],
  // informatica
  computer: ['monitor', 'cpu'], pc: ['monitor', 'cpu'], processore: ['cpu'], procesador: ['cpu'],
  disco: ['hard-drive'], hardisk: ['hard-drive'], telefono: ['smartphone'], cellulare: ['smartphone'], movil: ['smartphone'],
  fotocamera: ['camera'], camara: ['camera'], altoparlante: ['speaker'], altavoz: ['speaker'],
  // sicurezza / chimica / clima
  sicurezza: ['shield', 'lock'], seguridad: ['shield'], lucchetto: ['lock'], candado: ['lock'], chiave2: ['key'],
  chimica: ['flask-conical'], quimica: ['flask-conical'], vernice: ['paint-roller'], pintura: ['paint-roller'],
  acqua: ['droplet'], agua: ['droplet'], tubo: ['pipe'], tuberia: ['pipe'],
  fuoco: ['flame'], fuego: ['flame'], caldo: ['flame', 'sun'], freddo: ['snowflake'], frio: ['snowflake'],
  neve: ['snowflake'], nieve: ['snowflake'], sole: ['sun'], sol: ['sun'],
  temperatura: ['thermometer'], ventola: ['fan'], ventilatore: ['fan'], ventilador: ['fan'],
  ingranaggio: ['cog'], engranaje: ['cog'], elettrico: ['plug-zap', 'bolt'], electrico: ['plug-zap'],
};

/** Traduce una parola (lingua di lavoro) in termini inglesi se nota; altrimenti la
 *  restituisce così com'è (la ricerca lucide lavora comunque sui nomi inglesi). */
export function translateIconTerm(word: string): string[] {
  const k = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  return ICON_SYNONYMS[k] ?? [word];
}

/** Ricerca icone: traduce prima i termini IT/ES→EN (sinonimi), poi fa match sui nomi
 *  lucide (inglese). Es.: "cavo" → "cable". Match su nome normalizzato. Cap a `limit`. */
export function searchIcons(query: string, limit = 120): string[] {
  const raw = query.toLowerCase().trim();
  if (!raw) return [];
  // termini da cercare: la query normalizzata + le traduzioni note dei suoi token
  const terms = new Set<string>();
  terms.add(raw.replace(/[^a-z0-9]/g, ''));
  for (const tok of raw.split(/\s+/)) for (const t of translateIconTerm(tok)) terms.add(t.replace(/[^a-z0-9]/g, ''));
  const wanted = [...terms].filter(Boolean);
  const out: string[] = [];
  for (const name of ALL_ICON_NAMES) {
    const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (wanted.some((w) => norm.includes(w))) { out.push(name); if (out.length >= limit) break; }
  }
  return out;
}

/** Suggerimento "✨ AI" (deterministico, offline): dal NOME del nodo propone icona+colore,
 *  traducendo IT/ES→EN (§6.9.1). Ritorna la prima icona curata pertinente e un colore
 *  derivato in modo stabile dal nome. */
const SUGGEST_COLORS = ['#0D9488', '#4F46E5', '#B45309', '#E11D48', '#059669', '#0284C7', '#7C3AED', '#EA580C', '#0891B2', '#65A30D'];
export function suggestAppearance(name: string): { icon: string; color: string } {
  const tokens = name.toLowerCase().split(/\s+/).filter(Boolean);
  let icon = '';
  for (const tok of tokens) {
    const hits = searchIcons(tok, 1);
    if (hits.length) { icon = hits[0]!; break; }
  }
  if (!icon) icon = 'folder';
  // colore stabile dal nome (hash semplice)
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const color = SUGGEST_COLORS[h % SUGGEST_COLORS.length]!;
  return { icon, color };
}

/** Renderizza l'icona di categoria per nome, con dimensione e colore opzionali. */
export function CategoryIcon({ name, size = 16, color }: { name: string | null | undefined; size?: number; color?: string | null }) {
  const Ico = resolveCategoryIcon(name);
  return createElement(Ico, { size, ...(color ? { color } : {}) });
}
