"use client";

import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  applyVitalCalculations,
  type BpArm,
  type BpPosition,
  type VitalsData,
} from "@/lib/vitals";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, RotateCcw, X } from "lucide-react";

const INPUT = "!h-8 w-full !min-w-0 !px-2 !text-xs";

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="mb-1 block text-[10px] font-medium text-[var(--pv-muted-2)]">{children}</span>;
}

function VitalInput({
  label,
  value,
  onChange,
  disabled,
  suffix,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <Input
          className={cn(INPUT, suffix && "!pr-7")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          inputMode="decimal"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--pv-muted)]">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function CalcCell({
  label,
  value,
  disabled,
  onRecalculate,
  onClear,
}: {
  label: ReactNode;
  value: string;
  disabled?: boolean;
  onRecalculate: () => void;
  onClear: () => void;
}) {
  return (
    <div className="min-w-0">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-0.5">
        <Input className={cn(INPUT, "flex-1")} value={value} readOnly disabled={disabled} tabIndex={-1} />
        {!disabled && (
          <>
            <Button type="button" className="!h-8 !w-7 !shrink-0 !p-0" title="Recalculate" onClick={onRecalculate}>
              <RotateCcw size={12} />
            </Button>
            <Button type="button" className="!h-8 !w-7 !shrink-0 !p-0" title="Clear" onClick={onClear}>
              <X size={12} />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function RadioChip({
  name,
  label,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-[10px] transition",
        checked
          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
          : "border-[var(--pv-border)] text-[var(--pv-muted-2)] hover:border-[var(--pv-border-strong)]"
      )}
    >
      <input
        type="radio"
        name={name}
        className="h-3 w-3 accent-cyan-500"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      {label}
    </label>
  );
}

export function VitalsPanel({
  vitals,
  readOnly,
  onChange,
  compact = false,
}: {
  vitals: VitalsData;
  readOnly: boolean;
  onChange: (vitals: VitalsData) => void;
  /** When true, show core vitals only; expand for weight/BP/etc. */
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  function patch(partial: Partial<VitalsData>, recalc = true) {
    const next = { ...vitals, ...partial };
    onChange(recalc ? applyVitalCalculations(next) : next);
  }

  const coreRow = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
      <VitalInput
        label="Temp"
        value={vitals.temperature}
        disabled={readOnly}
        onChange={(temperature) => patch({ temperature }, false)}
      />
      <VitalInput
        label="Pulse"
        suffix="/min"
        value={vitals.pulse}
        disabled={readOnly}
        onChange={(pulse) => patch({ pulse }, false)}
      />
      <VitalInput
        label="Resp rate"
        suffix="/min"
        value={vitals.respiration}
        disabled={readOnly}
        onChange={(respiration) => patch({ respiration }, false)}
      />
      <VitalInput
        label="O2 sat"
        suffix="%"
        value={vitals.o2Sat}
        disabled={readOnly}
        onChange={(o2Sat) => patch({ o2Sat }, false)}
      />
      <VitalInput
        label="O2 amount"
        suffix="L"
        value={vitals.o2Amount}
        disabled={readOnly}
        onChange={(o2Amount) => patch({ o2Amount }, false)}
      />
    </div>
  );

  const moreFields = (
    <div className="mt-3 space-y-3 border-t border-[var(--pv-border)] pt-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        <VitalInput
          label="Weight"
          suffix="lbs"
          value={vitals.weightLbs}
          disabled={readOnly}
          onChange={(weightLbs) => patch({ weightLbs })}
        />
        <VitalInput
          label="Previous wt"
          suffix="lbs"
          value={vitals.previousWeightLbs}
          disabled={readOnly}
          onChange={(previousWeightLbs) => patch({ previousWeightLbs })}
        />
        <CalcCell
          label="Wt change"
          value={vitals.weightChangeLbs}
          disabled={readOnly}
          onRecalculate={() => patch({})}
          onClear={() => patch({ weightChangeLbs: "" }, false)}
        />
        <VitalInput
          label="Height"
          suffix="in"
          value={vitals.heightIn}
          disabled={readOnly}
          onChange={(heightIn) => patch({ heightIn })}
        />
        <CalcCell
          label="BMI"
          value={vitals.bmi}
          disabled={readOnly}
          onRecalculate={() => patch({})}
          onClear={() => patch({ bmi: "" }, false)}
        />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <FieldLabel>BP</FieldLabel>
          <div className="flex items-center gap-1">
            <Input
              className={cn(INPUT, "!w-[3.25rem] shrink-0")}
              value={vitals.currentBpSystolic}
              onChange={(e) => patch({ currentBpSystolic: e.target.value }, false)}
              disabled={readOnly}
              inputMode="numeric"
              placeholder="Sys"
            />
            <span className="text-xs text-[var(--pv-muted)]">/</span>
            <Input
              className={cn(INPUT, "!w-[3.25rem] shrink-0")}
              value={vitals.currentBpDiastolic}
              onChange={(e) => patch({ currentBpDiastolic: e.target.value }, false)}
              disabled={readOnly}
              inputMode="numeric"
              placeholder="Dia"
            />
          </div>
        </div>
        <div className="min-w-0">
          <FieldLabel>Position</FieldLabel>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["", "—"],
                ["sitting", "Sitting"],
                ["standing", "Standing"],
                ["supine", "Supine"],
              ] as const
            ).map(([value, label]) => (
              <RadioChip
                key={value || "none-pos"}
                name="bp-position"
                label={label}
                checked={vitals.bpPosition === value}
                disabled={readOnly}
                onChange={() => patch({ bpPosition: value as BpPosition }, false)}
              />
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <FieldLabel>Arm</FieldLabel>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["", "—"],
                ["right", "Right"],
                ["left", "Left"],
              ] as const
            ).map(([value, label]) => (
              <RadioChip
                key={value || "none-arm"}
                name="bp-arm"
                label={label}
                checked={vitals.bpArm === value}
                disabled={readOnly}
                onChange={() => patch({ bpArm: value as BpArm }, false)}
              />
            ))}
          </div>
        </div>
        <label className="mb-1 flex items-center gap-1.5 text-[10px] text-[var(--pv-muted-2)]">
          <input
            type="checkbox"
            className="h-3 w-3 rounded accent-cyan-500"
            checked={vitals.o2RoomAir}
            disabled={readOnly}
            onChange={(e) => patch({ o2RoomAir: e.target.checked }, false)}
          />
          Room air
        </label>
      </div>
    </div>
  );

  if (!compact) {
    return (
      <div className="space-y-3">
        {coreRow}
        {moreFields}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-cyan-300/90">Vitals</h3>
        <Button
          type="button"
          className="!h-7 !gap-1 !px-2 !text-[11px]"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? "Less" : "More vitals"}
        </Button>
      </div>
      {coreRow}
      {expanded && moreFields}
    </div>
  );
}
