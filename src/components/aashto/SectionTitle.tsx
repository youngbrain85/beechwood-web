// Section heading shared by the screens: a title plus an uppercase tracked hint.
import { Group, Text } from '@mantine/core';

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <Group justify="space-between" align="baseline" mb={10} wrap="nowrap">
      <Text fz={12.5} fw={600} style={{ letterSpacing: '-0.01em' }}>
        {title}
      </Text>
      {hint ? (
        <Text fz={10.5} c="dimmed" tt="uppercase" ta="right" style={{ letterSpacing: '0.1em' }}>
          {hint}
        </Text>
      ) : null}
    </Group>
  );
}
