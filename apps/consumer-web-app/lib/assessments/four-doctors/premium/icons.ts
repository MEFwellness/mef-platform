/**
 * Four Doctors premium results — one icon per category, shared across
 * every component that represents a doctor visually (DoctorSummaryCards,
 * BalanceOverview, the hero) so the same doctor always reads with the
 * same glyph everywhere on the page.
 */

import { Footprints, Moon, Sparkles, UtensilsCrossed, type LucideIcon } from 'lucide-react';

const DOCTOR_ICON: Record<string, LucideIcon> = {
  dr_happiness: Sparkles,
  dr_quiet: Moon,
  dr_diet: UtensilsCrossed,
  dr_movement: Footprints,
};

export function getDoctorIcon(categoryId: string): LucideIcon {
  return DOCTOR_ICON[categoryId] ?? Sparkles;
}
