import type { Linea, Municipalidad } from '../../types/infrastructure.types';
import type { MembershipState } from '../../hooks/use-municipalidad-lineas';

/** One card of the grouped view; `municipalidad` is null for "Sin municipalidad". */
export interface LineaGroup {
  municipalidad: Municipalidad | null;
  lineas: Linea[];
  loading: boolean;
  error: string | null;
}

/** Lowercase, trimmed and accent-insensitive, so "linea" finds "Línea". */
export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

/**
 * Members of a group shown with the data of the full líneas list (refreshed
 * after edits); the membership row is the fallback. Ids are compared as
 * strings because they may arrive as numbers or strings.
 */
export function resolveLineas(members: Linea[], all: Linea[]): Linea[] {
  return members.map((member) => all.find((l) => String(l.idLinea) === String(member.idLinea)) ?? member);
}

/** All líneas minus the union of the per-municipalidad lists. */
export function ungroupedLineas(all: Linea[], memberships: MembershipState[]): Linea[] {
  const linked = new Set(memberships.flatMap((m) => m.lineas.map((l) => String(l.idLinea))));
  return all.filter((l) => !linked.has(String(l.idLinea)));
}

export function lineaMatches(linea: Linea, term: string): boolean {
  return (
    normalizeSearch(linea.nombreLinea).includes(term) || normalizeSearch(String(linea.numeroLinea)).includes(term)
  );
}

/**
 * Applies the search box to a group: a municipalidad whose name matches keeps
 * all its líneas; otherwise only matching líneas stay, and a group without
 * matches is hidden (null). `term` must already be normalized.
 */
export function filterGroup(group: LineaGroup, term: string): LineaGroup | null {
  if (!term) return group;
  if (group.municipalidad && normalizeSearch(group.municipalidad.nombreMunicipalidad).includes(term)) return group;
  const lineas = group.lineas.filter((l) => lineaMatches(l, term));
  return lineas.length > 0 ? { ...group, lineas } : null;
}
