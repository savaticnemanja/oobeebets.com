/**
 * Which constraint a failed query broke.
 *
 * drizzle wraps every failed query in a DrizzleQueryError whose message is the
 * SQL and its parameters, with the Postgres error itself on `cause`. Matching
 * the message for a constraint name — `String(err).includes("…_unique")` —
 * therefore never matches, and every "that handle is taken" / "that post was
 * deleted" branch fell through to a 500. An error raised at commit (a deferred
 * constraint) arrives from postgres-js unwrapped, so both shapes are read.
 */
export function violatedConstraint(err: unknown): string | null {
  for (let e: unknown = err, depth = 0; e && depth < 3; e = (e as { cause?: unknown }).cause, depth++) {
    const name = (e as { constraint_name?: unknown }).constraint_name;
    if (typeof name === "string") return name;
  }
  return null;
}

export function violates(err: unknown, constraint: string): boolean {
  return violatedConstraint(err) === constraint;
}
