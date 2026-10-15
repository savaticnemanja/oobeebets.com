/**
 * Makes the Stripe side of the plans, and is safe to run again: everything is
 * found before it is created.
 *
 *   npm run stripe:setup                                   # products, prices, portal
 *   npm run stripe:setup -- --webhook https://beta.oobeebets.com/api/webhooks/stripe
 *
 * For each tier in src/lib/tiers.ts: a Product (metadata tier=<id>) and a
 * monthly Price carrying the tier's lookup_key, which is how checkout and the
 * webhook find it. A product that already exists under the tier's name with a
 * monthly price of the same amount (the sandbox's hand-made "Base") is
 * adopted rather than duplicated.
 *
 * Then a customer-portal configuration that lets people switch between the
 * three plans, cancel at period end and update their card; and, with
 * --webhook, the endpoint with exactly the events the app handles. Its signing
 * secret is printed once — that is STRIPE_WEBHOOK_SECRET.
 *
 * Needs STRIPE_SECRET_KEY (a test key — it refuses a live one unless
 * --live is passed).
 */
import Stripe from "stripe";
import { TIERS, TIER_ORDER } from "../src/lib/tiers.ts";
import { WEBHOOK_EVENTS } from "../src/lib/billing/events.ts";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("Set STRIPE_SECRET_KEY first.");
if (!key.includes("_test_") && !process.argv.includes("--live")) {
  throw new Error("That's a live key. Pass --live if you really mean to set up live mode.");
}
const webhookAt = process.argv.indexOf("--webhook");
const webhookUrl = webhookAt > -1 ? process.argv[webhookAt + 1] : null;

const stripe = new Stripe(key, { apiVersion: "2026-08-26.dahlia" });
const productIds = {};
const priceIds = {};

for (const t of TIER_ORDER) {
  const tier = TIERS[t];
  const productData = {
    name: tier.name,
    description: tier.tagline,
    metadata: { app: "oobeebets", tier: t },
    marketing_features: tier.features.map((name) => ({ name })),
  };

  // Already set up: the lookup key resolves.
  const [existing] = (await stripe.prices.list({ lookup_keys: [tier.lookupKey], expand: ["data.product"] })).data;
  if (existing) {
    productIds[t] = existing.product.id;
    priceIds[t] = existing.id;
    if (existing.unit_amount !== tier.priceCents) {
      console.warn(`! ${tier.name}: Stripe charges ${existing.unit_amount}¢, tiers.ts says ${tier.priceCents}¢ — make a new Price and move the lookup key, don't edit this one.`);
    }
    console.log(`= ${tier.name}: ${existing.product.id} / ${existing.id}`);
    continue;
  }

  // A product made by hand under the same name and price: adopt it.
  const products = (await stripe.products.list({ active: true, limit: 100 })).data;
  let product = products.find((p) => p.metadata.tier === t) ?? products.find((p) => p.name === tier.name);
  let price = null;
  if (product) {
    const prices = (await stripe.prices.list({ product: product.id, active: true, type: "recurring", limit: 100 })).data;
    price = prices.find((p) => p.unit_amount === tier.priceCents && p.currency === "usd" && p.recurring?.interval === "month") ?? null;
    product = await stripe.products.update(product.id, productData);
  } else {
    product = await stripe.products.create(productData);
  }
  price ??= await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: tier.priceCents,
    recurring: { interval: "month" },
  });
  price = await stripe.prices.update(price.id, {
    lookup_key: tier.lookupKey,
    transfer_lookup_key: true,
    nickname: `${tier.name} monthly`,
    metadata: { app: "oobeebets", tier: t },
  });
  await stripe.products.update(product.id, { default_price: price.id });
  productIds[t] = product.id;
  priceIds[t] = price.id;
  console.log(`+ ${tier.name}: ${product.id} / ${price.id}`);
}

// The portal: switch between the plans, cancel at period end, card and invoices.
const portalFeatures = {
  customer_update: { enabled: true, allowed_updates: ["email"] },
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true },
  subscription_cancel: { enabled: true, mode: "at_period_end" },
  subscription_update: {
    enabled: true,
    default_allowed_updates: ["price"],
    proration_behavior: "create_prorations",
    products: TIER_ORDER.map((t) => ({ product: productIds[t], prices: [priceIds[t]] })),
  },
};
const configs = (await stripe.billingPortal.configurations.list({ active: true, limit: 100 })).data;
let portal = configs.find((c) => c.metadata?.app === "oobeebets");
portal = portal
  ? await stripe.billingPortal.configurations.update(portal.id, { features: portalFeatures })
  : await stripe.billingPortal.configurations.create({
      business_profile: { headline: "oobee bets — manage your plan" },
      features: portalFeatures,
      metadata: { app: "oobeebets" },
    });
console.log(`= portal: ${portal.id}`);

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

console.log(`\nSTRIPE_PORTAL_CONFIGURATION=${portal.id}`);
