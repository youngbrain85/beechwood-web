import { SApp } from '@/i18n/s.app';
import { Suspense, lazy } from 'react';
import { Route, Routes, NavLink as RouterNavLink } from 'react-router-dom';
import { AppShell, Group, NavLink, Stack, Text, UnstyledButton } from '@mantine/core';
import { supabase } from '@/lib/supabase';
import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import { useSession } from '@/auth/AuthGate';
import { AashtoOverview as Overview } from '@/routes/aashto/AashtoOverview';
import { Dashboard } from '@/routes/Dashboard';
import { AashtoQuantities as Quantities } from '@/routes/aashto/AashtoQuantities';
import { Model } from '@/routes/Model';
import { AashtoAnalysis as Analysis } from '@/routes/aashto/AashtoAnalysis';

// The sheet proposal screen pulls in the proposal engine, the worker and the sheet frames; load it only when that screen is opened.
const Proposals = lazy(() => import('@/routes/Proposals'));

const MENU = [
  { to: '/', label: SApp.navOverview },
  { to: '/model', label: SApp.navModel },
  { to: '/analysis', label: SApp.navAnalysis },
  { to: '/drawings', label: SApp.navDrawings },
  { to: '/quantities', label: SApp.navQuantities },
  { to: '/proposals', label: SApp.navProposals },
];

export function App() {
  // Rendered only below AuthGate, so a session always exists
  const session = useSession();

  return (
    <AppShell navbar={{ width: 224, breakpoint: 'xs' }} padding={0}>
      <AppShell.Navbar p={0} bg="var(--mantine-color-gray-0)">
        <Stack gap={0} h="100%">
          <div style={{ padding: '28px 16px 16px' }}>
            <Text size="md" fw={700} lh={1.2}>
              {SApp.brand}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {/* The bridge name comes from the bridge profile through s.app.ts */}
              {SApp.brandSub}
            </Text>
          </div>
          <Text
            size="10px"
            fw={600}
            c="dimmed"
            px={16}
            pb={6}
            style={{ letterSpacing: '0.15em' }}
          >
            NAVIGATION
          </Text>
          {MENU.map((m) => (
            <NavLink
              key={m.to}
              component={RouterNavLink}
              to={m.to}
              end={m.to === '/'}
              label={m.label}
              styles={{
                root: { paddingBlock: 10, paddingInline: 14 },
                label: { fontSize: 13.5, fontWeight: 500 },
              }}
            />
          ))}
          {/* Signed-in account and sign-out: shows the AuthGate session */}
          <Group
            justify="space-between"
            wrap="nowrap"
            px={16}
            py={10}
            mt="auto"
            style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}
          >
            <Text
              size="10px"
              c="dimmed"
              truncate
              style={{ minWidth: 0, flex: 1 }}
              title={session.user.email ?? ''}
            >
              {session.user.email ?? SApp.noEmail}
            </Text>
            <UnstyledButton
              onClick={() => void supabase.auth.signOut()}
              fz="10px"
              fw={600}
              c="ink.6"
              style={{ letterSpacing: '0.08em', flexShrink: 0 }}
              aria-label={SApp.signOut}
            >
              {SApp.signOut}
            </UnstyledButton>
          </Group>
          <Group
            justify="space-between"
            px={16}
            py={12}
            style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}
          >
            <Text size="9px" fw={600} c="dimmed" style={{ letterSpacing: '0.12em' }}>
              BUILD
            </Text>
            <Text size="10px" c="dimmed" className="tnum">
              v2.0.0 · GLB
            </Text>
          </Group>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main h="100vh" style={{ overflow: 'hidden' }}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/model" element={<Model />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/drawings" element={<Dashboard />} />
          <Route path="/quantities" element={<Quantities />} />
          {/* The first lazy route of this app: a tab left open across a redeploy can no longer fetch the old chunk.
              Without a boundary the whole screen goes blank, so only this route is wrapped (the others are unchanged). */}
          <Route
            path="/proposals"
            element={
              <RouteErrorBoundary>
                <Suspense fallback={<Text size="xs" c="dimmed" p="lg">{SApp.loading}</Text>}>
                  <Proposals />
                </Suspense>
              </RouteErrorBoundary>
            }
          />
          <Route path="*" element={<Overview />} />
        </Routes>
      </AppShell.Main>
    </AppShell>
  );
}
