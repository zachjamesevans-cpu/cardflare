import { ApiError, syncApplePurchase } from "./api";

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
  /** Waiting on somebody else: Ask to Buy, or a payment method Apple
      has to check first. Nothing to do until Apple says. */
  | { kind: "pending" }
  /** No store to talk to: old build, simulator, or store trouble. */
  | { kind: "unavailable" }
  /** This Apple ID's subscription is on another cardflare account. */
  | { kind: "claimed" }
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
/** How long the sheet may sit with neither event before we stop
    holding the button. The purchase itself is not lost by this. */
const PURCHASE_WAIT_MS = 2 * 60 * 1000;

export async function buyPro(playerId: string): Promise<BuyOutcome> {
  const iap = await store();
  if (!iap) return { kind: "unavailable" };

  buying = true;
  return new Promise<BuyOutcome>((resolve) => {
    let done = false;
    const finish = (outcome: BuyOutcome) => {
      if (done) return;
      done = true;
      buying = false;
      clearTimeout(timer);
      updated.remove();
      failed.remove();
      resolve(outcome);
    };

    /* Neither listener fired: the sheet was dismissed in a way StoreKit
       did not report, or the transaction is stuck. Let go of the
       button; an owned transaction is picked up on the next open. */
    const timer = setTimeout(() => finish({ kind: "unconfirmed" }), PURCHASE_WAIT_MS);

    const updated = iap.purchaseUpdatedListener((purchase) => {
      if (purchase.productId !== PRO_PRODUCT_ID) return;
      /* Ask to Buy: the transaction exists but nobody has paid yet.
         Finishing it now would throw the approval away. */
      if ("purchaseState" in purchase && purchase.purchaseState === "pending") {
        finish({ kind: "pending" });
        return;
      }
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
          await iap.finishTransaction({ purchase, isConsumable: false });
          finish(result.pro ? { kind: "pro" } : { kind: "unconfirmed" });
        } catch (caught) {
          /* Apple handed back the subscription this Apple ID already
             has, and the server has it on another cardflare account. */
          finish(
            caught instanceof ApiError &&
              caught.status === 403 &&
              caught.code === "claimed"
              ? { kind: "claimed" }
              : { kind: "unconfirmed" },
          );
        }
      })();
    });

    const failed = iap.purchaseErrorListener((error) => {
      finish(
        error.code === "user-cancelled"
          ? { kind: "cancelled" }
          : error.code === "deferred-payment"
            ? { kind: "pending" }
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

/**
 * Quietly finishes what the phone already owns.
 *
 * A purchase whose confirm call was lost, or one made from the App
 * Store's own subscription page, is redelivered by StoreKit as an owned
 * transaction, but nothing was listening for it outside the paywall's
 * own buy flow. The paywall calls this on open, so a player who paid is
 * Pro the next time they look, without hunting for Restore. Nothing is
 * prompted: this reads, it does not ask Apple to sync.
 */
export async function syncOwnedPro(): Promise<SyncOutcome> {
  const iap = await store();
  if (!iap) return "none";
  try {
    const owned = await iap.getAvailablePurchases();
    return await confirmAll(
      iap,
      (owned ?? []).filter((p) => p.productId === PRO_PRODUCT_ID),
    );
  } catch {
    return "none";
  }
}

/**
 * What the server made of the phone's Pro transactions, taken together:
 * Pro for this account, owned by ANOTHER cardflare account (the server's
 * 403 "claimed"), or neither.
 */
export type SyncOutcome = "pro" | "claimed" | "none";

export { APPLE_SUBSCRIPTIONS_URL, CLAIMED_MESSAGE, renewalLine } from "./pro-copy";

type Purchase = Awaited<ReturnType<Iap["getAvailablePurchases"]>>[number];

function originalIdOf(purchase: Purchase): string | null {
  return (
    ("originalTransactionIdentifierIOS" in purchase
      ? purchase.originalTransactionIdentifierIOS
      : null) ??
    purchase.transactionId ??
    null
  );
}

/**
 * Pokes the server with each transaction, and finishes the ones it
 * confirmed. Finishing is what tells StoreKit the purchase was
 * delivered; an unfinished one is redelivered on every launch, which is
 * the safety net for a lost confirm, so only a confirmed one is
 * finished. One bad sync does not hide a good one beside it.
 */
async function confirmAll(iap: Iap, purchases: Purchase[]): Promise<SyncOutcome> {
  let pro = false;
  let claimed = false;
  for (const purchase of purchases) {
    const original = originalIdOf(purchase);
    if (!original) continue;
    try {
      const result = await syncApplePurchase(original);
      if (result.pro) pro = true;
      await iap.finishTransaction({ purchase, isConsumable: false }).catch(() => {});
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403 && caught.code === "claimed") {
        claimed = true;
      }
      /* Anything else: next launch tries again. */
    }
  }
  return pro ? "pro" : claimed ? "claimed" : "none";
}

/* True while the paywall's own buy is in flight, so the app-wide
   listener below leaves that purchase to buyPro. */
let buying = false;
let listening = false;

/**
 * Once per launch, signed in: finish what the phone owns, and keep
 * listening for transactions that arrive outside the paywall.
 *
 * Renewals, an Ask to Buy approved an hour later, a purchase made on the
 * App Store's own subscription page: StoreKit delivers each as a
 * transaction update whenever the app is running, and until now only
 * the Pro screen ever asked, so a player who paid was not Pro until
 * they happened to open it. Silent: no prompt, nothing drawn.
 */
export async function startProSync(): Promise<void> {
  const iap = await store();
  if (!iap) return;
  await syncOwnedPro().catch(() => "none");
  if (listening) return;
  listening = true;
  iap.purchaseUpdatedListener((purchase) => {
    if (buying || purchase.productId !== PRO_PRODUCT_ID) return;
    if ("purchaseState" in purchase && purchase.purchaseState === "pending") return;
    void confirmAll(iap, [purchase]).catch(() => {});
  });
}

export type RestoreOutcome =
  | { kind: "pro" }
  /** The store answered and holds no Pro subscription for this
      Apple ID. Honest: nothing to restore. */
  | { kind: "none" }
  /** There is one, and it belongs to another cardflare account. */
  | { kind: "claimed" }
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

    const outcome = await confirmAll(iap, mine);
    return { kind: outcome };
  } catch (caught) {
    return {
      kind: "failed",
      message: caught instanceof Error ? caught.message : "Restore failed.",
    };
  }
}
