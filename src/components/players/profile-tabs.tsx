"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeftRight,
  BookOpen,
  Crosshair,
  Flame,
  Sparkles,
  Store,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * The profile's sections as tabs that slide in place, under the
 * header and the binder highlights.
 *
 * The founder, with a recording of Instagram's profile: "Take note of
 * how instagram looks with this and make the UI closer to this. The
 * goal is to just have a sliding animation between them that's click
 * and doesn't go into a full screen animation / loading screen so you
 * can still access these buttons." So the round doors of the profile
 * IA round are a strip of icon tabs now, and the sections they opened
 * are panes side by side in a track that slides sideways when a tab
 * is tapped or the pane is swiped. The strip stays on screen. Nothing
 * navigates and nothing loads: every pane's data is already on the
 * profile, rendered on the server and handed in here as children
 * keyed by tab.
 *
 * Your own profile: Flares, Hunts, Binders, Showcase, Trades, Embers.
 * Somebody else's: the first four. Flares is where a profile opens.
 * Settings is a screen, not a section, so it is the cog top right
 * again and not a tab. Icon only, as Instagram's strip is; the label
 * is there for a screen reader alone. The app's profile-tabs.tsx draws
 * the same strip with the same six, in the same order, with the same
 * words.
 *
 * The tab rides in the address as `?tab=hunts` through
 * history.replaceState, so a reload or a shared link lands on the
 * right pane, and the old /profile/hunts and /profile/binders pages
 * redirect here with the tab set.
 */

import {
  DEFAULT_PROFILE_TAB,
  profileTabsFor,
  type ProfileTab,
} from "@/lib/players/profile-tabs";

export {
  DEFAULT_PROFILE_TAB,
  profileTabFrom,
  profileTabsFor,
} from "@/lib/players/profile-tabs";
export type { ProfileTab } from "@/lib/players/profile-tabs";

/* Flares wear the flame, the same glyph as the Flare tab in the dock,
   and Embers the shop, since the tab is the store. The founder: "it
   should be changed to a flare icon for that section of the profile.
   The embers store page thing should be a small shop icon." */
const TABS: Record<ProfileTab, { label: string; icon: LucideIcon }> = {
  flares: { label: "Flares", icon: Flame },
  hunts: { label: "Hunts", icon: Crosshair },
  binders: { label: "Binders", icon: BookOpen },
  showcase: { label: "Showcase", icon: Sparkles },
  trades: { label: "Trades", icon: ArrowLeftRight },
  embers: { label: "Embers", icon: Store },
};

/** How far a finger goes sideways before it is a swipe, not a tap. */
const SWIPE_PX = 40;

/* False for the server's HTML and the hydration pass, true once the
   page is alive: no effect, no state, no extra render. */
const noop = () => () => {};
const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

/**
 * Whether a touch that started here is a scroll of some rail, in which
 * case the track leaves it alone: the showcase shelf and the binder
 * highlights scroll sideways on their own, and a drag along one of
 * them must not also turn the page.
 */
function insideSidewaysScroller(
  target: EventTarget | null,
  until: HTMLElement,
): boolean {
  let node = target instanceof Element ? target : null;
  while (node && node !== until) {
    const { overflowX } = getComputedStyle(node);
    if (
      (overflowX === "auto" || overflowX === "scroll") &&
      node.scrollWidth > node.clientWidth
    ) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function ProfileTabs({
  yours,
  initial,
  panes,
}: {
  /** The owner's six tabs, or a visitor's four. */
  yours: boolean;
  /** The tab the page opens on: from the address, Flares by default. */
  initial: ProfileTab;
  /** The sections, server-rendered, one per tab. */
  panes: Partial<Record<ProfileTab, ReactNode>>;
}) {
  const tabs = profileTabsFor(yours);
  const [active, setActive] = useState<ProfileTab>(
    tabs.includes(initial) ? initial : DEFAULT_PROFILE_TAB,
  );
  const index = Math.max(0, tabs.indexOf(active));
  const baseId = useId();

  /*
   * Until the page has hydrated, the panes that are not open are not
   * drawn at all, so the server's HTML is exactly as tall as the open
   * pane. Once it is, the window takes the open pane's height and the
   * others come in beside it, clipped: no jump, and no render of the
   * whole profile for a height that only the DOM needs to know.
   */
  const hydrated = useHydrated();
  const paneRefs = useRef<Partial<Record<ProfileTab, HTMLDivElement | null>>>({});
  const tabRefs = useRef<Partial<Record<ProfileTab, HTMLButtonElement | null>>>({});
  const trackRef = useRef<HTMLDivElement>(null);

  /* The window is as tall as the open pane, and follows it as it
     grows or shrinks (a hunt unfolding, a binder created). */
  useLayoutEffect(() => {
    const pane = paneRefs.current[active];
    const track = trackRef.current;
    if (!pane || !track) return;
    const measure = () => {
      track.style.height = `${pane.offsetHeight}px`;
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [active]);

  /* The tab in the address, replaced in place: no navigation, no
     history entry, and the default tab leaves the address clean. */
  useEffect(() => {
    const url = new URL(window.location.href);
    const current = url.searchParams.get("tab");
    const next = active === DEFAULT_PROFILE_TAB ? null : active;
    if (current === next) return;
    if (next) url.searchParams.set("tab", next);
    else url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [active]);

  const select = useCallback((tab: ProfileTab, focus = false) => {
    setActive(tab);
    if (focus) tabRefs.current[tab]?.focus();
  }, []);

  /* Left and right arrows walk the strip, as a tablist expects. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowLeft" ? -1 : 1;
    const next = tabs[(index + step + tabs.length) % tabs.length];
    select(next, true);
  };

  /*
   * A sideways drag on the track turns the page, the way the pane
   * under Instagram's strip does. Touch and pen only: a mouse drag is
   * a text selection. The track lets the browser keep vertical pans
   * (`touch-pan-y`), so a vertical drag scrolls the page and cancels
   * the pointer, and the gesture does nothing here.
   */
  const gesture = useRef<{ id: number; x: number; y: number; done: boolean } | null>(
    null,
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    const track = trackRef.current;
    if (!track || insideSidewaysScroller(event.target, track)) return;
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      done: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = gesture.current;
    if (!drag || drag.done || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return;
    drag.done = true;
    const next = tabs[index + (dx < 0 ? 1 : -1)];
    if (next) select(next);
  };

  const endGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gesture.current?.id === event.pointerId) gesture.current = null;
  };

  return (
    <div className="flex w-full flex-col">
      {/* The strip: icon tabs the full width of the block, evenly
          spaced, 44px tall, one line under the whole row, and one
          underline that slides to whichever tab is on. */}
      <div
        role="tablist"
        aria-label={yours ? "Your profile" : "This profile"}
        onKeyDown={onKeyDown}
        className="relative flex w-full border-b border-border"
      >
        {tabs.map((tab) => {
          const on = tab === active;
          const Icon = TABS[tab].icon;
          return (
            <button
              key={tab}
              ref={(node) => {
                tabRefs.current[tab] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab}`}
              aria-selected={on}
              aria-controls={`${baseId}-pane-${tab}`}
              aria-label={TABS[tab].label}
              tabIndex={on ? 0 : -1}
              onClick={() => select(tab)}
              className={cn(
                "flex h-11 flex-1 cursor-pointer items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none focus-visible:ring-inset",
                on ? "text-text-primary" : "text-text-muted hover:text-text-secondary",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
            </button>
          );
        })}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 bg-accent transition-transform duration-200 ease-out"
          style={{
            width: `${100 / tabs.length}%`,
            transform: `translateX(${index * 100}%)`,
          }}
        />
      </div>

      {/* The track: every pane side by side, the whole row slid so the
          open one is in the window, the window as tall as that pane. */}
      <div
        ref={trackRef}
        className="w-full touch-pan-y overflow-hidden transition-[height] duration-200 ease-out"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
      >
        <div
          className="flex w-full items-start"
          style={{
            transform: `translateX(-${index * 100}%)`,
            transition: "transform 240ms var(--ease-out-soft)",
          }}
        >
          {tabs.map((tab) => {
            const on = tab === active;
            return (
              <div
                key={tab}
                ref={(node) => {
                  paneRefs.current[tab] = node;
                }}
                role="tabpanel"
                id={`${baseId}-pane-${tab}`}
                aria-labelledby={`${baseId}-tab-${tab}`}
                aria-hidden={!on}
                inert={!on}
                hidden={!on && !hydrated}
                className="w-full shrink-0 pt-4"
              >
                {panes[tab] ?? null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
