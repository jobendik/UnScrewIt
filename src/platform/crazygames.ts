/**
 * CrazyGames SDK adapter with a standalone shim.
 *
 * The SDK is loaded lazily from the CrazyGames CDN. If loading fails (or
 * we're running locally outside the platform), the shim takes over so the
 * game remains fully playable. The shim's rewarded-ad implementation
 * shows a fake "Ad" overlay and resolves successfully — useful for local
 * QA of the ad-driven flows.
 *
 * Cadence rules (gating when ads actually request) live in `./ads.ts`.
 */

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

type RewardCallbacks = {
  adFinished?: () => void;
  adError?: (err: unknown) => void;
  adStarted?: () => void;
};

interface CrazyGamesGameApi {
  gameplayStart?: () => void;
  gameplayStop?: () => void;
  happytime?: () => void;
}

interface CrazyGamesAdApi {
  requestAd?: (type: 'rewarded' | 'midgame', callbacks: RewardCallbacks) => void;
}

interface CrazyGamesUserApi {
  getUserData?: () => Promise<unknown>;
  setUserData?: (data: unknown) => Promise<unknown>;
}

interface CrazyGamesSDK {
  init?: () => Promise<void>;
  game?: CrazyGamesGameApi;
  ad?: CrazyGamesAdApi;
  user?: CrazyGamesUserApi;
}

declare global {
  interface Window {
    CrazyGames?: { SDK?: CrazyGamesSDK };
  }
}

let sdk: CrazyGamesSDK | null = null;
let ready = false;
let initialised: Promise<void> | null = null;

/**
 * Load the SDK if available. Resolves successfully even if loading fails
 * (in which case shim mode is active and `isShim()` returns true).
 */
export function init(): Promise<void> {
  if (initialised) return initialised;
  initialised = new Promise<void>((resolve) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    const fail = (): void => {
      ready = true;
      resolve();
    };
    script.onerror = fail;
    script.onload = async () => {
      sdk = window.CrazyGames?.SDK ?? null;
      if (sdk?.init) {
        try { await sdk.init(); } catch { /* swallow */ }
      }
      ready = true;
      resolve();
    };
    document.head.appendChild(script);
    // Safety net: don't block boot if the CDN hangs.
    window.setTimeout(fail, 3000);
  });
  return initialised;
}

export function isReady(): boolean { return ready; }
export function isShim(): boolean { return ready && !sdk; }

export function gameplayStart(): void { sdk?.game?.gameplayStart?.(); }
export function gameplayStop(): void { sdk?.game?.gameplayStop?.(); }
export function happytime(): void { sdk?.game?.happytime?.(); }

/**
 * Request a rewarded ad. If the SDK isn't available (or the request
 * fails), the shim shows a brief fake-ad overlay and grants the reward
 * anyway — never punish the player for ad infra failing.
 */
export function requestRewardedAd(): Promise<{ ok: true } | { ok: false; reason: string }> {
  return new Promise((resolve) => {
    if (sdk?.ad?.requestAd) {
      let settled = false;
      const settle = (val: { ok: true } | { ok: false; reason: string }) => {
        if (settled) return;
        settled = true;
        resolve(val);
      };
      try {
        sdk.ad.requestAd('rewarded', {
          adFinished: () => settle({ ok: true }),
          adError: (e) => settle({ ok: false, reason: String(e) }),
        });
      } catch (e) {
        settle({ ok: false, reason: String(e) });
      }
      // Safety net.
      window.setTimeout(() => settle({ ok: false, reason: 'timeout' }), 35_000);
    } else {
      // Shim: show fake-ad overlay and resolve after ~1.5s.
      showFakeAd(() => resolve({ ok: true }));
    }
  });
}

export function requestMidgameAd(): void {
  sdk?.ad?.requestAd?.('midgame', {});
}

// ── Shim helpers ────────────────────────────────────────────────────────

function showFakeAd(onFinish: () => void): void {
  const el = document.createElement('div');
  el.setAttribute('role', 'dialog');
  el.style.cssText = `
    position: fixed; inset: 0; z-index: 200; display: grid; place-items: center;
    background: rgba(8, 16, 28, .85); color: #fff; font-family: inherit;
    text-align: center; padding: 24px;
  `;
  el.innerHTML = `
    <div>
      <div style="font-size: 12px; opacity: .65; letter-spacing: 3px; text-transform: uppercase;">Ad simulation</div>
      <div style="font-size: 32px; font-weight: 800; margin: 12px 0;">Watching ad…</div>
      <div id="fakeAdCount" style="font-size: 56px; font-weight: 800;">3</div>
      <div style="opacity: .65; margin-top: 18px;">Reward will be granted shortly.</div>
    </div>
  `;
  document.body.appendChild(el);
  let n = 3;
  const counter = el.querySelector<HTMLDivElement>('#fakeAdCount');
  const tick = window.setInterval(() => {
    n -= 1;
    if (counter) counter.textContent = String(Math.max(0, n));
    if (n <= 0) {
      window.clearInterval(tick);
      el.remove();
      onFinish();
    }
  }, 500);
}
