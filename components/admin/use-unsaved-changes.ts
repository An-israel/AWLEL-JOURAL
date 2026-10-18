"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { askToLeave } from "./leave-guard";

/**
 * Warns before leaving the page while a form has unsaved changes (section 10,
 * item 71): closing or reloading the tab, clicking a link to another admin
 * page, and the browser's Back and Forward buttons.
 */
export function useUnsavedChanges(dirty: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!dirty) return;
    let leaving = false;
    // The page as it was when the form became dirty, to put back if the
    // person presses Back and then chooses to stay.
    const here = { url: window.location.href, state: window.history.state as unknown };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!leaving) e.preventDefault();
    };

    // Capture phase on window runs before the router's own link handling.
    const onClick = (e: MouseEvent) => {
      if (leaving || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // opens a new tab or window
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const to = new URL(link.href, window.location.href);
      // Other sites go through beforeunload; links within this page are harmless.
      if (to.origin !== window.location.origin) return;
      if (to.pathname === window.location.pathname && to.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      void askToLeave().then((leave) => {
        if (!leave) return;
        leaving = true;
        router.push(to.pathname + to.search + to.hash);
      });
    };

    // Back/Forward: the address has already changed when this fires. Hold the
    // router back, ask, then either let it continue or restore the address.
    const onPopState = (e: PopStateEvent) => {
      if (leaving) return;
      e.stopImmediatePropagation();
      const state = e.state as unknown;
      void askToLeave().then((leave) => {
        if (leave) {
          leaving = true;
          window.dispatchEvent(new PopStateEvent("popstate", { state }));
        } else {
          window.history.pushState(here.state, "", here.url);
        }
      });
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState, true);
    };
  }, [dirty, router]);
}
