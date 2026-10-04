import { SApp, SAuth } from '@/i18n/s.app';
import { useState, type FormEvent } from 'react';
import {
  Button,
  Center,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { supabase } from '@/lib/supabase';

/**
 * Maps Supabase Auth error messages to user-facing text.
 * Unknown errors keep the original message appended so they can be diagnosed.
 */
function toDisplayError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials'))
    return SAuth.errInvalid;
  if (m.includes('email not confirmed'))
    return SAuth.errNotConfirmed;
  if (m.includes('rate limit'))
    return SAuth.errRateLimit;
  if (m.includes('failed to fetch') || m.includes('network'))
    return SAuth.errNetwork;
  return SAuth.errUnknown(message);
}

/**
 * Login screen in the flat achromatic CAD style (sharp corners, near-black, Pretendard).
 * AuthGate shows it full-screen when there is no session.
 * Nothing to do on success: onAuthStateChange updates the AuthGate session and the app switches over.
 */
export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError(SAuth.errRequired);
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (err) setError(toDisplayError(err.message));
  }

  return (
    <Center h="100vh" bg="var(--mantine-color-gray-0)">
      <Paper
        w={360}
        p={28}
        withBorder
        style={{
          // Title-block look: near-black accent bar on top
          borderTop: '3px solid var(--mantine-color-ink-8)',
          borderColor: 'var(--mantine-color-gray-3)',
          borderTopColor: 'var(--mantine-color-ink-8)',
        }}
      >
        {/* Brand line, same as the sidebar */}
        <Text size="md" fw={700} lh={1.2}>
          {SApp.brand}
        </Text>
        <Text size="xs" c="dimmed" mt={4}>
          {SApp.brandSub}
        </Text>

        <Text
          size="10px"
          fw={600}
          c="dimmed"
          mt={24}
          mb={10}
          style={{ letterSpacing: '0.15em' }}
        >
          SIGN IN
        </Text>

        <form onSubmit={handleSubmit}>
          <Stack gap={12}>
            <TextInput
              label={SAuth.email}
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              size="sm"
              styles={{ label: { fontSize: 12, fontWeight: 600 } }}
              data-autofocus
            />
            <PasswordInput
              label={SAuth.password}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              size="sm"
              styles={{ label: { fontSize: 12, fontWeight: 600 } }}
            />
            {error ? (
              <Text size="xs" c="red.8" role="alert">
                {error}
              </Text>
            ) : null}
            <Button type="submit" fullWidth loading={busy} mt={4}>
              {SAuth.signIn}
            </Button>
          </Stack>
        </form>

        <Text size="10px" c="dimmed" mt={16}>
          {SAuth.notice}
        </Text>
      </Paper>
    </Center>
  );
}
