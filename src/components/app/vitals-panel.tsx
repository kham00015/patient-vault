"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  applyVitalCalculations,
  type BpArm,
  type BpPosition,
  type VitalsData,
} from "@/lib/vitals";
import { cn } from "@/lib/utils";
import { RotateCcw, X } from "lucide-react";

const INPUT = "!h-8 w-full !min-w-0 !px-2 !text-xs";

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block min-h-[2rem] text-[10px] font-medium leading-tight text-[#8b9cb3]">
      {children}
    </span>
  );
}

function VitalCell({
  label,
  children,
  className,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
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
    <VitalCell label={label}>
      <div className="relative">
        <Input
          className={cn(INPUT, suffix && "!pr-7")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          inputMode="decimal"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#6b7c93]">
            {suffix}
          </span>
        )}
      </div>
    </VitalCell>
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
    <VitalCell label={label}>
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
    </VitalCell>
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
          : "border-[#243044] text-[#8b9cb3] hover:border-[#2d3f57]"
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

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-t border-[#243044]/80 pt-3 first:border-t-0 first:pt-0", className)}>
      <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-cyan-300/90">{title}</h4>
      {children}
    </section>
  );
}

export function VitalsPanel({
  vitals,
  readOnly,
  onChange,
}: {
  vitals: VitalsData;
  readOnly: boolean;
  onChange: (vitals: VitalsData) => void;
}) {
  function patch(partial: Partial<VitalsData>, recalc = true) {
    const next = { ...vitals, ...partial };
    onChange(recalc ? applyVitalCalculations(next) : next);
  }

  return (
    <div className="rounded-lg border border-[#243044] bg-[#0f1520] p-4">
      <div className="max-w-3xl space-y-0">
        <Section title="Measurements">
          <div className="grid grid-cols-5 gap-x-3 gap-y-1">
            <VitalInput
              label="Weight"
              suffix="lbs"
              value={vitals.weightLbs}
              disabled={readOnly}
              onChange={(weightLbs) => patch({ weightLbs })}
            />
            <VitalInput
              label="Previous weight"
              suffix="lbs"
              value={vitals.previousWeightLbs}
              disabled={readOnly}
              onChange={(previousWeightLbs) => patch({ previousWeightLbs })}
            />
            <CalcCell
              label="Weight change"
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
        </Section>

        <Section title="Vitals">
          <div className="grid grid-cols-4 gap-x-3 gap-y-1">
            <VitalInput
              label="Temperature"
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
              label="Respiration"
              suffix="/min"
              value={vitals.respiration}
              disabled={readOnly}
              onChange={(respiration) => patch({ respiration }, false)}
            />
            <VitalCell label="O2 saturation">
              <div className="relative">
                <Input
                  className={cn(INPUT, "!pr-6")}
                  value={vitals.o2Sat}
                  onChange={(e) => patch({ o2Sat: e.target.value }, false)}
                  disabled={readOnly}
                  inputMode="decimal"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#6b7c93]">
                  %
                </span>
              </div>
              <label className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#8b9cb3]">
                <input
                  type="checkbox"
                  className="h-3 w-3 rounded accent-cyan-500"
                  checked={vitals.o2RoomAir}
                  disabled={readOnly}
                  onChange={(e) => patch({ o2RoomAir: e.target.checked }, false)}
                />
                Room air
              </label>
            </VitalCell>
          </div>
        </Section>

        <Section title="Blood pressure">
          <div className="grid grid-cols-[minmax(0,7rem)_1fr] items-start gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,7rem)_1fr_1fr]">
            <VitalCell label="BP">
              <div className="flex items-center gap-1">
                <Input
                  className={cn(INPUT, "!w-[3.25rem] shrink-0")}
                  value={vitals.currentBpSystolic}
                  onChange={(e) => patch({ currentBpSystolic: e.target.value }, false)}
                  disabled={readOnly}
                  inputMode="numeric"
                  placeholder="Sys"
                />
                <span className="text-xs text-[#6b7c93]">/</span>
                <Input
                  className={cn(INPUT, "!w-[3.25rem] shrink-0")}
                  value={vitals.currentBpDiastolic}
                  onChange={(e) => patch({ currentBpDiastolic: e.target.value }, false)}
                  disabled={readOnly}
                  inputMode="numeric"
                  placeholder="Dia"
                />
              </div>
            </VitalCell>

            <VitalCell label="Position">
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
            </VitalCell>

            <VitalCell label="Arm">
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
            </VitalCell>
          </div>
        </Section>
      </div>
    </div>
  );
}
