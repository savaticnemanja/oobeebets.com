import { redirect } from "next/navigation";

/** My bets became Stats; old links land there. */
export default function OldMyBetsPage() {
  redirect("/stats");
}
