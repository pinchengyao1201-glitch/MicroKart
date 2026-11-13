// The payment seam. Nothing here talks to a real payment provider yet: with none configured, a checkout is
// simulated so the whole purchase flow (shop -> checkout -> gems granted) can be played through in development.
//
// To take real money, replace the body of createCheckout with a call to your provider (for example a Stripe
// Checkout Session for the pack's price id), return { mode: 'redirect', url }, and grant the gems from the
// provider's signed webhook into a server-side wallet. Never trust the browser to say a purchase happened.

import { GEM_PACKS } from '../shared/catalog.js';

export function createCheckout(sku) {
  const pack = GEM_PACKS.find((p) => p.sku === sku);
  if (!pack) return { error: 'Unknown pack' };
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_PAYMENTS !== '1')
    return { error: 'Purchases are not switched on yet.' };
  return { mode: 'mock', sku: pack.sku, gems: pack.gems, price: pack.price };
}
