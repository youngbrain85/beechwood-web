// ------------------------------------------------------------------
//  AASHTO damage form: one damage plus one observation at the clicked point of the object chosen in the 3D view.
//
//  Inputs: defect (list filtered by the category of the object's element), condition state CS1-CS4 (radios; choosing
//        a defect shows its CS2-CS4 descriptions), quantity + unit (locked to the element unit; chosen only for
//        objects without an element), notes. A quantity above the element total of the object shows a warning under
//  the field (not blocking; damageForm quantityWarning). Rules, validation and stored values live in damageForm.ts
//  (pure); saving is hooks/useSupabase registerDamage. The position uses the profile's station, elevation and offset.
// ------------------------------------------------------------------
import { useEffect, useState } from 'react';
import { Button, Group, Modal, NumberInput, Radio, Select, Stack, Text, Textarea } from '@mantine/core';
import { bridge } from '@/bridge';
import { registerDamage } from '@/hooks/useSupabase';
import { SEval } from '@/i18n/s.eval';
import type { ConditionState } from '@/lib/eval/aashto';
import type { ObjectRow } from '@/types/db';
import { CsSwatch } from './cs';
import { buildAashtoDamage, quantityWarning, type AashtoFormContext, type AashtoFormValues } from './damageForm';

/* The three element units (aashto_elements.unit) */
const UNITS = ['sq ft', 'ft', 'each'];

const EMPTY: AashtoFormValues = { defectNo: null, cs: null, quantity: '', unit: null, notes: '' };

export function AashtoDamageFormFields({
  ctx,
  values,
  onChange,
}: {
  ctx: AashtoFormContext;
  values: AashtoFormValues;
  onChange: (v: AashtoFormValues) => void;
}) {
  const defect = ctx.defects.find((d) => d.no === values.defectNo);
  const warning = quantityWarning(values, ctx);
  return (
    <Stack gap="sm">
      {ctx.element ? (
        <Group gap={8} wrap="nowrap" align="baseline">
          <Text size="10px" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: '0.1em' }}>
            {SEval.element}
          </Text>
          <Text size="xs" fw={600}>
            {SEval.numbered(ctx.element.no, ctx.element.name)}
          </Text>
          <Text size="xs" c="dimmed">
            ({ctx.element.unit})
          </Text>
        </Group>
      ) : (
        <Text size="xs" c="orange.9" lh={1.4}>
          {SEval.form.noElement}
        </Text>
      )}
      <Select
        size="xs"
        label={SEval.defect}
        placeholder={SEval.form.defectPlaceholder}
        data={ctx.defects.map((d) => ({ value: String(d.no), label: SEval.numbered(d.no, d.name) }))}
        value={values.defectNo === null ? null : String(values.defectNo)}
        onChange={(v) => onChange({ ...values, defectNo: v ? Number(v) : null })}
        searchable
        required
      />
      <Radio.Group
        label={SEval.conditionState}
        description={SEval.form.csHelp}
        value={values.cs === null ? null : String(values.cs)}
        onChange={(v) => onChange({ ...values, cs: Number(v) as ConditionState })}
        required
      >
        <Stack gap={6} mt={6}>
          {([1, 2, 3, 4] as ConditionState[]).map((cs) => (
            <Radio
              key={cs}
              size="xs"
              value={String(cs)}
              label={
                <Group gap={6} wrap="nowrap" component="span">
                  <CsSwatch cs={cs} />
                  <span>{SEval.csLabel(cs)}</span>
                </Group>
              }
              description={cs > 1 && defect ? defect.cs[cs as 2 | 3 | 4] : undefined}
            />
          ))}
        </Stack>
      </Radio.Group>
      <Group grow gap="xs" align="flex-start">
        <NumberInput
          size="xs"
          label={SEval.quantity}
          description={SEval.form.quantityHelp}
          min={0}
          step={1}
          value={values.quantity}
          onChange={(v) => onChange({ ...values, quantity: typeof v === 'number' ? v : '' })}
          required
        />
        <Select
          size="xs"
          label={SEval.unit}
          description={ctx.lockedUnit ? SEval.form.unitLocked : undefined}
          data={UNITS}
          value={ctx.lockedUnit ?? values.unit}
          onChange={(v) => onChange({ ...values, unit: v })}
          disabled={ctx.lockedUnit !== null}
          required
        />
      </Group>
      {warning ? (
        // Non-blocking warning: the register button still works
        <Text size="xs" c="orange.9" lh={1.4} role="status" data-quantity-warning="" mt={-6}>
          {warning}
        </Text>
      ) : null}
      <Textarea
        size="xs"
        label={SEval.notes}
        placeholder={SEval.form.notesPlaceholder}
        autosize
        minRows={2}
        value={values.notes}
        onChange={(e) => onChange({ ...values, notes: e.currentTarget.value })}
      />
    </Stack>
  );
}

/* Register modal, opened from the 3D view (Model.tsx) */
export function AashtoDamageForm({
  opened,
  target,
  object,
  ctx,
  onClose,
  onRegistered,
}: {
  opened: boolean;
  target: { objectCode: string; hitPoint: { x: number; y: number; z: number } } | null;
  object: ObjectRow | undefined;
  ctx: AashtoFormContext | null;
  onClose: () => void;
  onRegistered: () => void;
}) {
  const [values, setValues] = useState<AashtoFormValues>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reset every time the modal opens
  useEffect(() => {
    if (!opened) return;
    setValues(EMPTY);
    setSubmitting(false);
    setFormError(null);
  }, [opened]);

  const submit = async () => {
    if (!target || !object || !ctx) {
      setFormError(SEval.form.errNoObject);
      return;
    }
    const r = buildAashtoDamage(values, ctx, {
      bridgeId: object.bridge_id,
      objectId: object.id,
      position: { ...target.hitPoint },
    });
    if (!r.ok) {
      setFormError(r.error);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await registerDamage(r.input);
      onRegistered();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text size="sm" fw={700}>
          {SEval.form.title}
          {target ? ` — ${target.objectCode}` : ''}
        </Text>
      }
      centered
      size={440}
      // The three.js rAF loop races the Mantine transition and the mount gets dropped, so no transition
      transitionProps={{ duration: 0 }}
    >
      <Stack gap="sm">
        {target ? (
          <Text size="10px" c="dimmed" className="tnum">
            {bridge.sta.label(target.hitPoint.z)} · {bridge.sta.el(target.hitPoint.y)} · {bridge.sta.x(target.hitPoint.x)}
          </Text>
        ) : null}
        {ctx ? <AashtoDamageFormFields ctx={ctx} values={values} onChange={setValues} /> : null}
        {formError ? (
          <Text size="xs" c="red">
            {formError}
          </Text>
        ) : null}
        <Group justify="flex-end" gap="xs">
          <Button size="xs" variant="default" onClick={onClose} disabled={submitting}>
            {SEval.form.cancel}
          </Button>
          <Button size="xs" onClick={submit} loading={submitting}>
            {SEval.form.register}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
