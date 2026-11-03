/**
 * Makes the Stripe side of the subscription, and is safe to run again:
 * everything is found before it is created.
 *
 *   npm run stripe:setup                                   # product, price, portal
 *   npm run stripe:setup -- --webhook https://oobeebets.com/api/webhooks/stripe
 *
 * The plan from src/lib/plan.ts: a Product (metadata product=subscription)
 * and a recurring Price — every PLAN.intervalWeeks weeks — carrying the
 * plan's lookup_key, which is how checkout and the webhook find it. The
 * free trial isn't on the Price; checkout adds it per subscription, so it can
 * be once per account. Then any older prices (the 14-day pass, the monthly
 * Base / Pro / Elite plans) are archived, so nobody can be sold one.
 *
 * The customer portal (card, invoices, cancelling) is set up on the
 * account's default configuration; if the account has none yet, one is made
 * and its id printed — that is STRIPE_PORTAL_CONFIGURATION. With --webhook,
 * the endpoint gets exactly the events the app handles. A new endpoint's
 * signing secret is printed once — that is STRIPE_WEBHOOK_SECRET.
 *
 * Needs STRIPE_SECRET_KEY (a test key — it refuses a live one unless
 * --live is passed) and NEXT_PUBLIC_SITE_URL for the portal's links.
 */
import Stripe from "stripe";
import { PLAN } from "../src/lib/plan.ts";
import { WEBHOOK_EVENTS } from "../src/lib/billing/events.ts";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("Set STRIPE_SECRET_KEY first.");
if (!key.includes("_test_") && !process.argv.includes("--live")) {
  throw new Error("That's a live key. Pass --live if you really mean to set up live mode.");
}
const webhookAt = process.argv.indexOf("--webhook");
const webhookUrl = webhookAt > -1 ? process.argv[webhookAt + 1] : null;
const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://oobeebets.com").replace(/\/$/, "");

const stripe = new Stripe(key, { apiVersion: "2026-08-26.dahlia" });

/* --------------------------------------------------------- product + price */

const productData = {
  name: PLAN.name,
  description: PLAN.tagline,
  metadata: { app: "oobeebets", product: "subscription" },
  marketing_features: PLAN.features.map((name) => ({ name })),
};
const [existing] = (await stripe.prices.list({ lookup_keys: [PLAN.lookupKey], expand: ["data.product"] })).data;
if (existing) {
  // The product's words follow plan.ts; its price never changes in place.
  await stripe.products.update(existing.product.id, productData);
  const r = existing.recurring;
  if (existing.unit_amount !== PLAN.priceCents || r?.interval !== "week" || r?.interval_count !== PLAN.intervalWeeks) {
    console.warn(
      `! ${PLAN.name}: Stripe charges ${existing.unit_amount}¢ every ${r?.interval_count} ${r?.interval}, plan.ts says ${PLAN.priceCents}¢ every ${PLAN.intervalWeeks} weeks — make a new Price and move the lookup key, don't edit this one.`,
    );
  }
  console.log(`= ${PLAN.name}: ${existing.product.id} / ${existing.id}`);
} else {
  const products = (await stripe.products.list({ active: true, limit: 100 })).data;
  let product = products.find((p) => p.metadata.app === "oobeebets" && p.metadata.product === "subscription");
  product = product ? await stripe.products.update(product.id, productData) : await stripe.products.create(productData);
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: PLAN.priceCents,
    recurring: { interval: "week", interval_count: PLAN.intervalWeeks },
    lookup_key: PLAN.lookupKey,
    transfer_lookup_key: true,
    nickname: `${PLAN.name} — every ${PLAN.intervalWeeks} weeks`,
    metadata: { app: "oobeebets", product: "subscription" },
  });
  await stripe.products.update(product.id, { default_price: price.id });
  console.log(`+ ${PLAN.name}: ${product.id} / ${price.id}`);
}

/* ------------------------------------------------------------ old prices */

// Archived, never deleted — Stripe keeps their history.
const old = ["oobee_pass_14d", "oobee_base_monthly", "oobee_pro_monthly", "oobee_elite_monthly"];
for (const price of (await stripe.prices.list({ lookup_keys: old, active: true, limit: 10 })).data) {
  // Product first: Stripe won't archive a price that's still an active
  // product's default.
  await stripe.products.update(typeof price.product === "string" ? price.product : price.product.id, { active: false });
  await stripe.prices.update(price.id, { active: false });
  console.log(`- archived ${price.lookup_key}: ${price.id}`);
}

/* ---------------------------------------------------------- customer portal */

// Card and invoices, and cancelling at the end of the period. No plan
// switching: there's one plan.
const portal = {
  business_profile: {
    headline: "oobee bets — manage your subscription",
    privacy_policy_url: `${site}/legal/privacy`,
    terms_of_service_url: `${site}/legal/terms`,
  },
  default_return_url: `${site}/account#plan`,
  features: {
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
    customer_update: { enabled: true, allowed_updates: ["email", "address"] },
    subscription_cancel: {
      enabled: true,
      mode: "at_period_end",
      proration_behavior: "none",
      cancellation_reason: {
        enabled: true,
        options: ["too_expensive", "unused", "low_quality", "switched_service", "other"],
      },
    },
    subscription_update: { enabled: false },
  },
  metadata: { app: "oobeebets" },
};
const configs = (await stripe.billingPortal.configurations.list({ limit: 100 })).data;
const def = configs.find((c) => c.is_default);
// An update also clears any plans an older setup left to switch between
// (Stripe refuses archived prices there).
const clearSwitching = { ...portal, features: { ...portal.features, subscription_update: { enabled: false, products: "" } } };
if (def) {
  await stripe.billingPortal.configurations.update(def.id, clearSwitching);
  console.log(`= portal: ${def.id} (the default — updated)`);
} else {
  const mine = configs.find((c) => c.metadata?.app === "oobeebets");
  const cfg = mine
    ? await stripe.billingPortal.configurations.update(mine.id, clearSwitching)
    : await stripe.billingPortal.configurations.create(portal);
  console.log(`${mine ? "=" : "+"} portal: ${cfg.id}`);
  console.log(`\nSTRIPE_PORTAL_CONFIGURATION=${cfg.id}`);
}

/* ---------------------------------------------------------------- webhook */

if (webhookUrl) {
  const endpoints = (await stripe.webhookEndpoints.list({ limit: 100 })).data;
  const found = endpoints.find((e) => e.url === webhookUrl);
  if (found) {
    await stripe.webhookEndpoints.update(found.id, { enabled_events: [...WEBHOOK_EVENTS], disabled: false });
    console.log(`= webhook: ${found.id} (secret unchanged — it's in the Dashboard)`);
  } else {
    const created = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: [...WEBHOOK_EVENTS],
      metadata: { app: "oobeebets" },
    });
    console.log(`+ webhook: ${created.id}`);
    console.log(`\nSTRIPE_WEBHOOK_SECRET=${created.secret}`);
  }
}
