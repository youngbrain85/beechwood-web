// ------------------------------------------------------------------
//  Error boundary for lazily loaded routes: when a tab left open across a redeploy cannot
//  fetch a chunk the screen goes blank. There is no React renderer here to mount the screen,
//  but the boundary's decision (static getDerivedStateFromError) is a pure function and is tested as is.
// ------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { SApp } from '@/i18n/s.app';

describe('RouteErrorBoundary', () => {
  it('moves to the notice state when a chunk cannot be fetched', () => {
    const e = new TypeError('Failed to fetch dynamically imported module: /assets/Proposals-abc.js');
    expect(RouteErrorBoundary.getDerivedStateFromError(e)).toEqual({ failed: true });
  });

  it('shows the same notice for any error, which beats a blank screen', () => {
    expect(RouteErrorBoundary.getDerivedStateFromError(new Error('boom'))).toEqual({ failed: true });
    expect(RouteErrorBoundary.getDerivedStateFromError('a string can be thrown too')).toEqual({ failed: true });
  });

  it('shows no notice at first', () => {
    expect(RouteErrorBoundary.INITIAL_STATE).toEqual({ failed: false });
  });
});

describe('notice text', () => {
  it('has two non-empty, different messages', () => {
    expect(SApp.routeLoadError.length).toBeGreaterThan(0);
    expect(SApp.reload.length).toBeGreaterThan(0);
    expect(SApp.routeLoadError).not.toBe(SApp.reload);
  });

  it('differs from the loading text: failed to fetch and still fetching are different states', () => {
    expect(SApp.routeLoadError).not.toBe(SApp.loading);
  });
});
