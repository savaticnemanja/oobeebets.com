/**
 * The English catalogue, and the shape every other language has to match.
 *
 * A second language is a sibling file plus one entry in `LOCALES` — the type of
 * this object is the contract, so a missing or misspelled key is a build error
 * rather than a blank on the page.
 *
 * Migration is incremental and deliberately so. What lives here first is the
 * copy that is *structurally* hard to translate later: strings held in
 * `Record<enum, string>` tables and shipped to the client as data, where a
 * translator has no component to look at and no context to work from. Prose
 * still inline in a page is easy to move whenever that page is next touched.
 */
export const en = {
  /** Sport names. Keys are the `sport` enum in db/schema.ts. */
  sport: {
    soccer: "Soccer",
    basketball: "Basketball",
    baseball: "Baseball",
    tennis: "Tennis",
    hockey: "Hockey",
    football: "Football",
  },

  /**
   * Bet types. Keys are the `market` enum. Here rather than inline because it
   * is one of the Record<enum, string> tables the note above is about — the
   * admin follow breakdown ships it as data with no sentence around it.
   */
  market: {
    moneyline: "Moneyline",
    spread: "Spread",
    total: "Total",
    prop: "Prop",
  },

  /** Pick outcomes. Keys are the `pick_status` enum. Never colour-only. */
  status: {
    won: "Won",
    lost: "Lost",
    pending: "Pending",
    push: "Push",
    void: "Void",
  },

  /** Site chrome. */
  nav: {
    home: "Home",
    profile: "Profile",
    about: "About",
    picks: "Picks",
    myBets: "My bets",
    account: "Account",
    admin: "Admin",
    signIn: "Sign in",
    signOut: "Sign out",
    getPicks: "Get picks",
    skipToContent: "Skip to content",
    openMenu: "Open menu",
    accountMenu: "Account menu",
    mainNav: "Main",
    mobileNav: "Mobile",
  },

  account: {
    todaysPicks: "Today's picks",
    account: "Account",
    adminPanel: "Admin panel",
  },
} as const;

export type Messages = typeof en;
