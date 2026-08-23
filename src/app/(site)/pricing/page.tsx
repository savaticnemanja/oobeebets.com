import { redirect } from "next/navigation";

// Beta: no paid plans — the top 15 are free for everyone. Old links land on
// the board instead of a dead page.
export default function PricingPage() {
  redirect("/picks");
}
