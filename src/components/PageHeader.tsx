import type { ReactNode } from 'react';
import { Group, Text, Title } from '@mantine/core';

/**
 * Title bar at the top of a page.
 */
export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <Group
      justify="space-between"
      px="lg"
      py={14}
      style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}
      bg="white"
    >
      <div>
        <Title order={2} fz={17} fw={700} lh={1.2}>
          {title}
        </Title>
        {subtitle ? (
          <Text size="xs" c="dimmed" mt={2}>
            {subtitle}
          </Text>
        ) : null}
      </div>
      {right ?? null}
    </Group>
  );
}
