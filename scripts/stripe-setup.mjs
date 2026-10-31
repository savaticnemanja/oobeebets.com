/**
 * Makes the Stripe side of the 14-day pass, and is safe to run again:
 * everything is found before it is created.
 *
 *   npm run stripe:setup                                   # product and price
 *   npm run stripe:setup -- --webhook https://oobeebets.com/api/webhooks/stripe
 *
 * The pass from src/lib/pass.ts: a Product (metadata product=pass) and a
 * one-time Price carrying the pass's lookup_key, which is how checkout and the
 * webhook find it. Then any monthly Base / Pro / Elite prices left from the
 * old plans are archived, so nobody can be sold one; and, with --webhook, the
 * endpoint with exactly the events the app handles. Its signing secret is
 * printed once — that is STRIPE_WEBHOOK_SECRET.
 *
 * Needs STRIPE_SECRET_KEY (a test key — it refuses a live one unless
 * --live is passed).
 */
import Stripe from "stripe";
import { PASS } from "../src/lib/pass.ts";
import { WEBHOOK_EVENTS } from "../src/lib/billing/events.ts";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error("Set STRIPE_SECRET_KEY first.");
if (!key.includes("_test_") && !process.argv.includes("--live")) {
  throw new Error("That's a live key. Pass --live if you really mean to set up live mode.");
}
const webhookAt = process.argv.indexOf("--webhook");
const webhookUrl = webhookAt > -1 ? process.argv[webhookAt + 1] : null;

const stripe = new Stripe(key, { apiVersion: "2026-08-26.dahlia" });

// Already set up: the lookup key resolves.
const [existing] = (await stripe.prices.list({ lookup_keys: [PASS.lookupKey], expand: ["data.product"] })).data;
if (existing) {
  if (existing.unit_amount !== PASS.priceCents) {
    console.warn(`! ${PASS.name}: Stripe charges ${existing.unit_amount}¢, pass.ts says ${PASS.priceCents}¢ — make a new Price and move the lookup key, don't edit this one.`);
  }
  console.log(`= ${PASS.name}: ${existing.product.id} / ${existing.id}`);
} else {
  const productData = {
    name: PASS.name,
    description: PASS.tagline,
    metadata: { app: "oobeebets", product: "pass" },
    marketing_features: PASS.features.map((name) => ({ name })),
  };
  const products = (await stripe.products.list({ active: true, limit: 100 })).data;
  let product = products.find((p) => p.metadata.app === "oobeebets" && p.metadata.product === "pass");
  product = product ? await stripe.products.update(product.id, productData) : await stripe.products.create(productData);
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: PASS.priceCents,
    lookup_key: PASS.lookupKey,
    transfer_lookup_key: true,
    nickname: PASS.name,
    metadata: { app: "oobeebets", product: "pass" },
  });
  await stripe.products.update(product.id, { default_price: price.id });
  console.log(`+ ${PASS.name}: ${product.id} / ${price.id}`);
}

// The old monthly plans: archived, never deleted — Stripe keeps their history.
const old = ["oobee_base_monthly", "oobee_pro_monthly", "oobee_elite_monthly"];
for (const price of (await stripe.prices.list({ lookup_keys: old, active: true, limit: 10 })).data) {
  // Product first: Stripe won't archive a price that's still an active
  // product's default.
  await stripe.products.update(typeof price.product === "string" ? price.product : price.product.id, { active: false });
  await stripe.prices.update(price.id, { active: false });
  console.log(`- archived ${price.lookup_key}: ${price.id}`);
}

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
