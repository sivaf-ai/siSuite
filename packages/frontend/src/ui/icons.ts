/** Mappa icone lucide-react (spec §6). Niente emoji, ogni azione la sua icona. */
import {
  Search, Plus, SlidersHorizontal, ArrowUpDown, Download, ChevronDown, ChevronRight,
  Pencil, Trash2, Copy, MoreHorizontal, Check, Mic, AlertTriangle,
  Briefcase, Building2, Users, Package, Box, Calendar, Settings, Layers, LayoutGrid,
  CalendarCheck, UserCircle, ShieldCheck, CreditCard, Hash, X, Clock, type LucideIcon,
} from 'lucide-react';

export {
  Search, Plus, SlidersHorizontal, ArrowUpDown, Download, ChevronDown, ChevronRight,
  Pencil, Trash2, Copy, MoreHorizontal, Check, Mic, AlertTriangle,
  Briefcase, Building2, Users, Package, Box, Calendar, Settings, Layers, LayoutGrid, X,
};
export type { LucideIcon };

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
  assets: Box,
  companies: Building2,
  resources: Users,
  materials: Package,
  users: UserCircle,
  roles: ShieldCheck,
  settings: Settings,
  numberseries: Hash,
  billing: CreditCard,
};
