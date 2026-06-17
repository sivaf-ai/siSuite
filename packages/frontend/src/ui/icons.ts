/** Mappa icone lucide-react (spec §6). Niente emoji, ogni azione la sua icona. */
import {
  Search, Plus, SlidersHorizontal, ArrowUpDown, Download, ChevronDown, ChevronRight,
  Pencil, Trash2, Copy, MoreHorizontal, Check, Mic, AlertTriangle,
  Briefcase, Building2, Users, Package, Box, Calendar, Settings, Layers, LayoutGrid,
  CalendarCheck, UserCircle, ShieldCheck, CreditCard, Hash, X, Clock, Warehouse, FileText,
  Timer, CalendarOff, Cable,
  LayoutDashboard, FolderKanban, HardHat, Wallet, Contact2, Shield, Sparkles, ClipboardList,
  ClipboardCheck, ArrowLeftRight, FileOutput, PiggyBank, Scale, UserRound, Truck, RadioTower,
  UserCog, KeyRound, Star, CornerDownRight, ExternalLink, ChevronLeft, Circle,
  Columns3, Upload, Tags, Wrench,
  type LucideIcon,
} from 'lucide-react';

export {
  Search, Plus, SlidersHorizontal, ArrowUpDown, Download, ChevronDown, ChevronRight,
  Pencil, Trash2, Copy, MoreHorizontal, Check, Mic, AlertTriangle,
  Briefcase, Building2, Users, Package, Box, Calendar, Settings, Layers, LayoutGrid, X,
  Star, CornerDownRight, ExternalLink, ChevronLeft, Circle, Sparkles, Columns3, Upload,
};
export type { LucideIcon };

/** Risolve un nome-icona kebab (usato in nav.ts) → componente lucide. */
const LUCIDE_BY_NAME: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard, 'folder-kanban': FolderKanban, 'hard-hat': HardHat,
  warehouse: Warehouse, wallet: Wallet, 'contact-2': Contact2, settings: Settings, shield: Shield,
  briefcase: Briefcase, calendar: Calendar, sparkles: Sparkles, cable: Cable,
  'clipboard-list': ClipboardList, 'clipboard-check': ClipboardCheck, clock: Clock, timer: Timer,
  'calendar-off': CalendarOff, mic: Mic, layers: Layers, 'arrow-left-right': ArrowLeftRight,
  'file-output': FileOutput, package: Package, 'piggy-bank': PiggyBank, scale: Scale, users: Users,
  box: Box, 'user-round': UserRound, truck: Truck, 'radio-tower': RadioTower,
  'sliders-horizontal': SlidersHorizontal, 'user-cog': UserCog, 'key-round': KeyRound, star: Star, tags: Tags, wrench: Wrench,
};
export function iconByName(name: string | undefined): LucideIcon {
  return (name && LUCIDE_BY_NAME[name]) || Circle;
}

/** Icona per voce di menu (id). */
export const MENU_ICON: Record<string, LucideIcon> = {
  today: CalendarCheck,
  agenda: Calendar,
  captures: Mic,
  'captures-inbox': Layers,
  dashboard: LayoutGrid,
  planning: Calendar,
  engagements: Briefcase,
  'time-entries': Clock,
  'work-reports': FileText,
  timer: Timer,
  absences: CalendarOff,
  assets: Box,
  companies: Building2,
  resources: Users,
  materials: Package,
  stock: Warehouse,
  'work-orders': Cable,
  users: UserCircle,
  roles: ShieldCheck,
  settings: Settings,
  numberseries: Hash,
  billing: CreditCard,
};
