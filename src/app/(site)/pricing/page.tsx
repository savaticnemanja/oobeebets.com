import { redirect } from "next/navigation";
import { billingEnabled } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

/**
 * The plans live in the account page's Plan section now. This stays for links
 * already out there, and for Checkout sessions opened before the move, whose
 * cancel URL is still /pricing. With billing off (the free beta) there is
 * nothing to sell, so old links land on the board as they did before.
 */
export default function PricingPage() {
  redirect(billingEnabled() ? "/account#plan" : "/picks");
}
