import { redirect } from "next/navigation";
import { billingEnabled } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

/**
 * The subscription is sold from the board's banner and Settings' Plan
 * section. This stays for links already out there. With billing off
 * there is nothing to sell, so old links land on the board.
 */
export default function PricingPage() {
  redirect(billingEnabled() ? "/settings#plan" : "/picks");
}
