// The two places money can come in, both behind a seam so a real provider can be dropped in later:
//   1. gem packs, bought through the server's /api/checkout
//   2. rewarded ads, shown after a race to double the coins earned
// Neither is connected to a real provider in this build. Both show a clearly labelled stand-in instead, so the
// flows can be played through end to end without anyone being charged or shown a real advert.

import { useStore } from './store.js';

const set = useStore.setState;

/** Ask the server to start a checkout for a gem pack. Resolves to { ok, gems } or { ok: false, error }. */
export async function buyGemPack(sku) {
  let out;
  try {
    const res = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sku }) });
    out = await res.json();
  } catch {
    return { ok: false, error: 'Could not reach the shop. Try again in a moment.' };
  }
  if (out.error) return { ok: false, error: out.error };
  if (out.mode === 'redirect') {
    // a real provider: hand over to its hosted checkout page; gems arrive when its webhook confirms payment
    location.href = out.url;
    return { ok: false, error: null };
  }
  // no provider configured: confirm with a stand-in dialog
  const confirmed = await new Promise((resolve) => set({ modal: { kind: 'checkout', pack: out, resolve } }));
  set({ modal: null });
  if (!confirmed) return { ok: false, error: null };
  useStore.getState().grant({ gems: out.gems });
  return { ok: true, gems: out.gems };
}

/** Show a rewarded ad. Resolves true if it was watched to the end. */
export function showRewardedAd() {
  // swap this for your ad network's rewarded-video call; resolve true only from its "reward earned" callback
  return new Promise((resolve) => set({ modal: { kind: 'ad', resolve } })).then((ok) => {
    set({ modal: null });
    return ok;
  });
}
