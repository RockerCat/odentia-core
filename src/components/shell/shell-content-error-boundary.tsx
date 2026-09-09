"use client";

import { Component, type ReactNode } from "react";

// Defense-in-depth only, added alongside the real fix for a real
// production report (a fresh Clinic Admin's first hard navigation to
// /agenda rendering a totally blank page — see use-route-guard.ts's own
// comment for the actual root cause and fix). That bug's real cause is
// already fixed; this boundary doesn't mask it or any other bug — it
// only stops a FUTURE unrelated render exception in a page's own content
// (e.g. RealAgendaScreen) from taking the entire shell down to a blank
// page. The error still reaches the console via componentDidCatch,
// unchanged from React's own default behavior, and Sidebar/Header/
// BottomTabBar keep rendering either way — a broken page always leaves
// the user with a way to navigate elsewhere instead of a dead end.
type State = { error: Error | null };

export class ShellContentErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[ShellContentErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <p className="text-sm text-muted-foreground">No pudimos cargar esta página. Intenta de nuevo en unos minutos.</p>;
    }
    return this.props.children;
  }
}
