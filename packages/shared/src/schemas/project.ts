import { z } from "zod";

/**
 * Selectable document/spellcheck language codes (ISO 639-1) — the dictionary-backed
 * set, mirroring the domain's `SPELLCHECK_LANGUAGES`. The language is a project-level
 * setting that drives the editor's spellchecker.
 */
export const PROJECT_LANGUAGES = [
  "en", "es", "fr", "pt", "de", "it", "uk", "pl", "tr",
] as const;

/** Zod schema for an optional, nullable project language. */
export const projectLanguageSchema = z.enum(PROJECT_LANGUAGES).nullable().optional();

/**
 * Schema for validating project creation requests.
 */
export const createProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name must be 100 characters or less"),
  description: z
    .string()
    .max(1000, "Description must be 1000 characters or less")
    .optional()
    .nullable(),
  tags: z
    .array(z.string().max(50, "Tag must be 50 characters or less"))
    .max(10, "Maximum 10 tags allowed")
    .optional()
    .default([]),
  language: projectLanguageSchema,
});

/**
 * Schema for validating project update requests.
 */
export const updateProjectSchema = z.object({
  name: z
    .string()
    .min(1, "Project name is required")
    .max(100, "Project name must be 100 characters or less")
    .optional(),
  description: z
    .string()
    .max(1000, "Description must be 1000 characters or less")
    .optional()
    .nullable(),
  tags: z
    .array(z.string().max(50, "Tag must be 50 characters or less"))
    .max(10, "Maximum 10 tags allowed")
    .optional(),
  language: projectLanguageSchema,
});

/**
 * Schema for validating member invitation requests.
 */
export const inviteMemberSchema = z.object({
  email: z.email("Invalid email address"),
  role: z.enum(["viewer", "editor", "owner"]),
});

/**
 * Schema for validating member role update requests.
 */
export const updateMemberRoleSchema = z.object({
  role: z.enum(["viewer", "editor", "owner"]),
});

/**
 * Type inference from createProjectSchema.
 */
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/**
 * Type inference from updateProjectSchema.
 */
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

/**
 * Type inference from inviteMemberSchema.
 */
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

/**
 * Type inference from updateMemberRoleSchema.
 */
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
