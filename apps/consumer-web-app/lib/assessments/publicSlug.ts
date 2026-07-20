/**
 * Public URL slug for a questionnaire, decoupled from its stable internal
 * id (the REGISTRY key in lib/assessments/registry.ts and the
 * wellness_assessments.questionnaire_id value already stored for every
 * existing completed/in-progress attempt — neither may ever change once
 * data exists against it).
 *
 * Every generic engine page (app/assessments/[questionnaireId]/**) builds
 * its own outgoing links from `questionnaire.id`. Routing every one of
 * those through toPublicSlug() here means a member-facing URL rename only
 * ever touches this one map — never the stable id itself, never a data
 * migration. fromPublicSlug() is the inverse, used once at the top of
 * each [questionnaireId] page to resolve an incoming URL segment back to
 * the real internal id before calling any registry/store function.
 *
 * Today this has exactly one entry: the CHEK Practitioner questionnaire
 * (internal id "chek-hlc1-nutrition-lifestyle") is member-facing at
 * /assessments/nutrition-lifestyle. Every other questionnaire's public
 * slug is identical to its internal id (identity mapping) and needs no
 * entry here.
 */

const INTERNAL_ID_TO_PUBLIC_SLUG: Record<string, string> = {
  'chek-hlc1-nutrition-lifestyle': 'nutrition-lifestyle',
};

const PUBLIC_SLUG_TO_INTERNAL_ID: Record<string, string> = Object.fromEntries(
  Object.entries(INTERNAL_ID_TO_PUBLIC_SLUG).map(([id, slug]) => [slug, id])
);

export function toPublicSlug(questionnaireId: string): string {
  return INTERNAL_ID_TO_PUBLIC_SLUG[questionnaireId] ?? questionnaireId;
}

/** Also accepts the old internal id directly, so a stale bookmark that somehow bypasses the next.config.mjs redirect still resolves correctly rather than 404ing. */
export function fromPublicSlug(slug: string): string {
  return PUBLIC_SLUG_TO_INTERNAL_ID[slug] ?? slug;
}
