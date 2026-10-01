import { z } from 'zod';
const text = z.string().min(1);
export const ScenarioManifestSchema = z.object({
  scenario_id: text, version: z.number().int().positive(), name: text,
  product_profile: z.object({ id: text, lower_threshold: z.number().finite(), upper_threshold: z.number().finite() }).strict()
    .refine(p => p.lower_threshold < p.upper_threshold, { message: 'Lower threshold must be below upper threshold' }),
  segments: z.array(z.object({
    id: text, source: text, selector: text, handover_id: text.optional(),
    business_context_origin: z.literal('SYNTHETIC'),
  }).strict()).min(1),
  expected: z.object({ exception_count: z.number().int().nonnegative(), missing_issue_count: z.number().int().nonnegative(), conflict_issue_count: z.number().int().nonnegative().optional() }).strict(),
  constraints: z.object({ cross_source_duration: z.literal(false) }).strict(),
}).strict().refine(s => new Set(s.segments.map(v => v.id)).size === s.segments.length, { message: 'Segment IDs must be unique' });
export type ScenarioManifest = z.infer<typeof ScenarioManifestSchema>;
