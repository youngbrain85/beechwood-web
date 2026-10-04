import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Stack, Text } from '@mantine/core';
import { SApp } from '@/i18n/s.app';

// ------------------------------------------------------------------
//  Error boundary for lazily loaded routes.
//
//  Why: `/proposals` is the first `lazy` route of this app. A redeploy removes the old chunk files,
//  so a tab that was still open fails its import() when the user opens that menu. Without a
//  boundary React drops the whole tree and **the screen goes blank**, with no hint of what went wrong.
//  One reload fetches the new chunk, so a notice and a button are all that is needed.
//
//  A class component because error boundaries cannot be written with hooks yet (React 18).
//  The decision (getDerivedStateFromError) is a static pure function, so it is tested without a renderer.
// ------------------------------------------------------------------

interface State {
  failed: boolean;
}

export interface RouteErrorBoundaryProps {
  children: ReactNode;
}

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, State> {
  /* No notice at first; this is the initial state the test reads. */
  static readonly INITIAL_STATE: State = { failed: false };

  state: State = RouteErrorBoundary.INITIAL_STATE;

  /* Same notice for any error: whatever the cause, all the user can do is reload. */
  static getDerivedStateFromError(_error: unknown): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Not shown on screen; developer console only (a clue if a question comes in after a deploy).
    console.error('[RouteErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <Stack gap={10} p="lg" align="flex-start">
        <Text size="xs" c="dimmed">
          {SApp.routeLoadError}
        </Text>
        <Button size="xs" variant="default" onClick={() => window.location.reload()}>
          {SApp.reload}
        </Button>
      </Stack>
    );
  }
}
