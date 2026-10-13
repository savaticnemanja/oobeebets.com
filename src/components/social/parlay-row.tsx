import type { PostAuthor } from "@/lib/social";
import type { ParlayView } from "@/lib/parlay-store";
import { ParlayCard } from "@/components/parlay-card";

/**
 * A shared Community parlay in a timeline (Home, profiles): the same flat
 * ticket as on the Community parlays tab, with who shared it and when in its
 * header — so a ticket looks the same wherever it turns up.
 */
export function ParlayRow({ parlay, owner }: { parlay: ParlayView; owner: PostAuthor }) {
  return (
    <ParlayCard
      parlay={parlay}
      variant="row"
      owner={{ username: owner.username, displayName: owner.displayName, role: owner.role }}
    />
  );
}
