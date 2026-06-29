/**
 * CategoriePage — Anagrafica Categorie articolo ad ALBERO (caso pilota dello
 * STANDARD entità ad albero v1.0). Usa il componente generico EntityTree: NIENTE
 * logica d'albero qui (vietate viste custom, ADR-0002). La config è esportata e
 * riusata in pick mode da CategoryPickerDialog (scheda Articolo → Categoria, §6.10).
 */
import { Page } from '../components/Page';
import { EntityTree, type EntityTreeConfig } from '../ui/EntityTree';

export const materialCategoryTreeConfig: EntityTreeConfig = {
  entity: 'material_category',
  endpoint: '/material-categories',
  labels: { singular: 'Categoria', plural: 'Categorie articolo', subtitle: 'Classificazione gerarchica degli articoli' },
  permissions: { read: 'material:read', write: 'material:update' },
  countNoun: 'articoli',
  defaultSort: 'manual',
};

export function CategoriePage() {
  return <Page><EntityTree config={materialCategoryTreeConfig} /></Page>;
}
