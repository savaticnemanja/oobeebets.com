import { z } from "zod";

/**
 * One address, validated one way.
 *
 * Signup, login, pick and settlement schemas went with the routes that parsed
 * them, and the password rules with the accounts they guarded. What is left is
 * what the two forms on this site actually submit.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(3, "Enter your email")
  .max(254)
  .email("That doesn't look like an email")
  .transform((s) => s.toLowerCase());

export const waitlistSchema = z.object({ email: emailSchema });

/** The shape every server action returns to `useActionState`. */
export type ActionState =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  | null;
