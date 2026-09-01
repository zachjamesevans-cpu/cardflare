import { syncApplePurchase } from "./api";

/**
 * The Apple side of cardflare Pro, in one module.
 *
 * The store never decides anything. A purchase here is a POKE: the
 * app tells the server which original transaction to look at, the
 * server asks Apple's App Store Server API what that transaction
 * really is, and `players.tier` moves only on Apple's answer. So this
 * module's whole job is to run StoreKit's ceremony and hand the id
 * across — there is no entitlement cached on the phone to go stale or
 * to forge.
 *
 * expo-iap is imported lazily, inside the functions. The native module
 * only exists in builds made after it was added; a top-level import
 * would put `requireNativeModule` on the launch path of every OLDER
 * build and crash it at the front door. Loaded this way, an old build
 * (or a simulator with no store) just answers "unavailable", and the
 * screen says so instead of dying.
 */

export const PRO_PRODUCT_ID = "gg.cardflare.app.pro.monthly";

/** What the paywall shows until the store answers with the real,
    locally-priced string. Matches the website's pricing card. */
export const PRO_PRICE_FALLBACK = "$7.99";

type Iap = typeof import("expo-iap");

let loaded: Iap | null | undefined;
let connected = false;

/** The store, connected — or null where there is no store to connect. */
async function store(): Promise<Iap | null> {
  if (loaded === undefined) {
    try {
      loaded = await import("expo-iap");
    } catch {
      loaded = null;
    }
  }
  if (!loaded) return null;

  if (!connected) {
    try {
      await loaded.initConnection();
      connected = true;
    } catch {
      return null;
    }
  }
  return loaded;
}

/** The subscription's price as Apple formats it for this storefront
    ("$7.99", "€7,99", …), or the fallback when the store is silent. */
export async function proPrice(): Promise<string> {
  const iap = await store();
  if (!iap) return PRO_PRICE_FALLBACK;
  try {
    const products = await iap.fetchProducts({
      skus: [PRO_PRODUCT_ID],
      type: "subs",
    });
    const found = (products ?? []).find((p) => p.id === PRO_PRODUCT_ID);
    return found?.displayPrice ?? PRO_PRICE_FALLBACK;
  } catch {
    return PRO_PRICE_FALLBACK;
  }
}

export type BuyOutcome =
  /** Apple charged them and the server saw it: they are Pro right now. */
  | { kind: "pro" }
  /** They closed the sheet. Not an error; say nothing sharp. */
  | { kind: "cancelled" }
  /** Paid at the store, but our server could not confirm it yet. The
      purchase is safe: Restore purchases (or the webhook) finishes it. */
  | { kind: "unconfirmed" }
  /** No store to talk to: old build, simulator, or store trouble. */
  | { kind: "unavailable" }
  | { kind: "failed"; message: string };

/**
 * Buys Pro for this player.
 *
 * The result of `requestPurchase` arrives through the purchase
 * listeners, not the call's return value, so this wraps the whole
 * exchange in one promise: listen, ask, settle on whichever event
 * lands, always unhook.
 *
 * `appAccountToken` carries the playerId (a UUID, which is what Apple
 * requires the token to be). It comes back inside Apple's SIGNED
 * transaction, which is how the server later proves which account a
 * renewal belongs to without trusting anything the phone said.
 */
export async function buyPro(playerId: string): Promise<BuyOutcome> {
  const iap = await store();
  if (!iap) return { kind: "unavailable" };

  return new Promise<BuyOutcome>((resolve) => {
    let done = false;
    const finish = (outcome: BuyOutcome) => {
      if (done) return;
      done = true;
      updated.remove();
      failed.remove();
      resolve(outcome);
    };

    const updated = iap.purchaseUpdatedListener((purchase) => {
      if (purchase.productId !== PRO_PRODUCT_ID) return;
      void (async () => {
        try {
          const original =
            ("originalTransactionIdentifierIOS" in purchase
              ? purchase.originalTransactionIdentifierIOS
              : null) ??
            purchase.transactionId ??
            null;
          if (!original) {
            finish({ kind: "unconfirmed" });
            return;
          }
          const result = await syncApplePurchase(original);
          /* Only finish what the server has recorded. An unfinished
             transaction is redelivered on next launch, so a network
             blip costs a retry, never the purchase. */
          await iap.finishTransaction({ purchase });
          finish(result.pro ? { kind: "pro" } : { kind: "unconfirmed" });
        } catch {
          finish({ kind: "unconfirmed" });
        }
      })();
    });

    const failed = iap.purchaseErrorListener((error) => {
      finish(
        error.code === "user-cancelled"
          ? { kind: "cancelled" }
          : { kind: "failed", message: error.message ?? "Purchase failed." },
      );
    });

    iap
      .requestPurchase({
        request: {
          apple: { sku: PRO_PRODUCT_ID, appAccountToken: playerId },
        },
        type: "subs",
      })
      .catch(() => {
        /* Most request failures also fire the error listener; this
           catch covers the ones that do not. */
        finish({ kind: "unavailable" });
      });
  });
}

export type RestoreOutcome =
  | { kind: "pro" }
  /** The store answered and holds no Pro subscription for this
      Apple ID. Honest: nothing to restore. */
  | { kind: "none" }
  | { kind: "unavailable" }
  | { kind: "failed"; message: string };

/**
 * Restore purchases: new phone, reinstalled app, or a purchase the
 * confirm step dropped. Reads what the Apple ID already owns and pokes
 * the server with each Pro transaction it finds; the server does its
 * own Apple lookup before believing any of it.
 */
export async function restorePro(): Promise<RestoreOutcome> {
  const iap = await store();
  if (!iap) return { kind: "unavailable" };

  try {
    await iap.restorePurchases();
    const owned = await iap.getAvailablePurchases();
    const mine = (owned ?? []).filter((p) => p.productId === PRO_PRODUCT_ID);
    if (mine.length === 0) return { kind: "none" };

    let pro = false;
    for (const purchase of mine) {
      const original =
        ("originalTransactionIdentifierIOS" in purchase
          ? purchase.originalTransactionIdentifierIOS
          : null) ??
        purchase.transactionId ??
        null;
      if (!original) continue;
      try {
        const result = await syncApplePurchase(original);
        if (result.pro) pro = true;
      } catch {
        /* One bad sync should not hide a good one beside it. */
      }
    }
    return pro ? { kind: "pro" } : { kind: "none" };
  } catch (caught) {
    return {
      kind: "failed",
      message: caught instanceof Error ? caught.message : "Restore failed.",
    };
  }
}
