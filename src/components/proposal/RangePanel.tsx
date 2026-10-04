import { useEffect, useMemo, useState } from 'react';
import { Button, Group, Paper, RangeSlider, Stack, Text } from '@mantine/core';
import { bridge } from '@/bridge';
import type { ClipBox, Vec3 } from '@/lib/proposal/types';
import { NO_CLIP } from '@/lib/proposal/types';
import { SProposal } from '@/i18n/s.proposal';

// ------------------------------------------------------------------
//  Sheet proposals: range panel.
//
//  Picks a span per axis inside the world bbox of the selected members. Labels use the profile's station,
//  elevation and offset formats (bridge.sta: STA in 100 ft stations, EL ft, x ft), so they compare directly
//  with the drawings and titles of the bridge. The slider values themselves are world metres.
//  An axis left open to both ends is `null`, meaning "not cut" (the engine skips that axis).
//
//  Values go up when the drag is released (onChangeEnd): sending them every frame would rebuild
//  the 3D range box dozens of times a second. The engine debounces anyway.
// ------------------------------------------------------------------

/* Slider step (m): nothing finer than 0.1 m is needed (drawing labels have one decimal too). */
const STEP = 0.1;
/* Tolerance for "at the end": half a step. */
const EDGE = 0.05;

type Axis = 'x' | 'y' | 'z';
type Pair = [number, number];

export interface RangePanelProps {
  /* World bbox of the selected members; when absent (no selection) the panel is disabled. */
  bounds: { min: Vec3; max: Vec3 } | null;
  clip: ClipBox;
  onClipChange: (clip: ClipBox) => void;
}

const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/* bbox to slider limits widened to the 0.1 m grid. Placeholder values for the disabled state when bounds is absent. */
function limitsOf(bounds: { min: Vec3; max: Vec3 } | null): Record<Axis, Pair> {
  const of = (axis: Axis): Pair => {
    if (!bounds) return [0, 1];
    const i = AXIS_INDEX[axis];
    const lo = Math.floor(bounds.min[i] / STEP) * STEP;
    const hi = Math.ceil(bounds.max[i] / STEP) * STEP;
    // A flat member (a single plane) has lo === hi; widen by one step so the slider works.
    return [Number(lo.toFixed(1)), Number((hi > lo ? hi : lo + STEP).toFixed(1))];
  };
  return { x: of('x'), y: of('y'), z: of('z') };
}

/* An axis open to both ends is not cut (null). */
function toRange(value: Pair, limit: Pair): Pair | null {
  return value[0] <= limit[0] + EDGE && value[1] >= limit[1] - EDGE ? null : value;
}

export function RangePanel({ bounds, clip, onClipChange }: RangePanelProps) {
  const limits = useMemo(() => limitsOf(bounds), [bounds]);
  const [value, setValue] = useState<Record<Axis, Pair>>(limits);

  // When the selection (= bbox) changes, reset to the full range, so a leftover range cannot cut
  // the new member away entirely and leave no face.
  const limitKey = JSON.stringify(limits);
  useEffect(() => {
    setValue(limits);
    onClipChange(NO_CLIP);
    // limitKey only: limits/onClipChange are new references on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitKey]);

  const emit = (next: Record<Axis, Pair>) =>
    onClipChange({
      x: toRange(next.x, limits.x),
      y: toRange(next.y, limits.y),
      z: toRange(next.z, limits.z),
    });

  const reset = () => {
    setValue(limits);
    onClipChange(NO_CLIP);
  };

  const rows: Array<{ axis: Axis; title: string; label: (v: number) => string }> = [
    { axis: 'z', title: SProposal.rangeLongitudinal, label: bridge.sta.label },
    { axis: 'y', title: SProposal.rangeHeight, label: bridge.sta.el },
    { axis: 'x', title: SProposal.rangeTransverse, label: bridge.sta.x },
  ];

  const disabled = !bounds;
  const narrowed = !!(clip.x || clip.y || clip.z);

  return (
    <Paper withBorder radius="sm" p="sm">
      <Group gap={6} mb={disabled ? 4 : 10}>
        <Text size="xs" fw={700}>
          {SProposal.rangeTitle}
        </Text>
        <Button
          size="compact-xs"
          variant="subtle"
          ml="auto"
          disabled={disabled || !narrowed}
          onClick={reset}
        >
          {SProposal.rangeReset}
        </Button>
      </Group>

      {disabled ? (
        <Text size="10px" c="dimmed">
          {SProposal.rangeNoSelection}
        </Text>
      ) : (
        <Stack gap={14}>
          {rows.map(({ axis, title, label }) => (
            <div key={axis}>
              <Group gap={6} mb={2}>
                <Text size="10px" fw={600}>
                  {title}
                </Text>
                <Text size="10px" c="dimmed" ml="auto" className="tnum">
                  {label(value[axis][0])} ~ {label(value[axis][1])}
                </Text>
              </Group>
              <RangeSlider
                size="xs"
                min={limits[axis][0]}
                max={limits[axis][1]}
                step={STEP}
                minRange={STEP}
                value={value[axis]}
                label={label}
                onChange={(v) => setValue((s) => ({ ...s, [axis]: v }))}
                onChangeEnd={(v) => {
                  const next = { ...value, [axis]: v };
                  setValue(next);
                  emit(next);
                }}
              />
            </div>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
