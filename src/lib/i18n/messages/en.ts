/**
 * The English catalogue, and the shape every other language has to match.
 *
 * A second language is a sibling file plus one entry in `LOCALES` — the type of
 * this object is the contract, so a missing or misspelled key is a build error
 * rather than a blank on the page.
 *
 * Cut to what the pre-launch site renders. The sport, status and account
 * tables that used to live here described picks, tiers and an account menu,
 * none of which are in this build; they belong with the product rather than
 * with a signup form. The mechanism is kept rather than inlined because the
 * strings come back with the pages that need them.
 */
export const en = {
  /** Site chrome. */
  nav: {
    skipToContent: "Skip to content",
  },
} as const;

export type Messages = typeof en;
