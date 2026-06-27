export type BpPosition = "" | "sitting" | "standing" | "supine";
export type BpArm = "" | "right" | "left";

export type VitalsData = {
  weightLbs: string;
  previousWeightLbs: string;
  weightChangeLbs: string;
  heightIn: string;
  bmi: string;
  temperature: string;
  pulse: string;
  respiration: string;
  o2Sat: string;
  o2RoomAir: boolean;
  currentBpSystolic: string;
  currentBpDiastolic: string;
  bpPosition: BpPosition;
  bpArm: BpArm;
};

export function createEmptyVitals(): VitalsData {
  return {
    weightLbs: "",
    previousWeightLbs: "",
    weightChangeLbs: "",
    heightIn: "",
    bmi: "",
    temperature: "",
    pulse: "",
    respiration: "",
    o2Sat: "",
    o2RoomAir: true,
    currentBpSystolic: "",
    currentBpDiastolic: "",
    bpPosition: "",
    bpArm: "",
  };
}

function parseNum(value: string) {
  const n = parseFloat(value.trim());
  return Number.isFinite(n) ? n : null;
}

export function calculateWeightChangeLbs(weightLbs: string, previousWeightLbs: string): string {
  const weight = parseNum(weightLbs);
  const previous = parseNum(previousWeightLbs);
  if (weight === null || previous === null) return "";
  const delta = weight - previous;
  const formatted = delta.toFixed(1);
  return formatted.endsWith(".0") ? formatted.slice(0, -2) : formatted;
}

export function calculateBmi(weightLbs: string, heightIn: string): string {
  const weight = parseNum(weightLbs);
  const height = parseNum(heightIn);
  if (weight === null || height === null || height <= 0) return "";
  const bmi = (weight / (height * height)) * 703;
  return bmi.toFixed(1);
}

export function applyVitalCalculations(vitals: VitalsData): VitalsData {
  return {
    ...vitals,
    weightChangeLbs: calculateWeightChangeLbs(vitals.weightLbs, vitals.previousWeightLbs),
    bmi: calculateBmi(vitals.weightLbs, vitals.heightIn),
  };
}

export function vitalsHasContent(vitals: VitalsData): boolean {
  const { o2RoomAir: _o2, bpPosition: _bp, bpArm: _arm, ...rest } = vitals;
  return Object.values(rest).some((v) => String(v).trim() !== "");
}

export function formatVitalsForDisplay(vitals: VitalsData): string {
  const lines: string[] = [];

  const measureParts: string[] = [];
  if (vitals.weightLbs.trim()) measureParts.push(`Weight ${vitals.weightLbs} lbs`);
  if (vitals.previousWeightLbs.trim()) measureParts.push(`Previous weight ${vitals.previousWeightLbs} lbs`);
  if (vitals.weightChangeLbs.trim()) measureParts.push(`Weight change ${vitals.weightChangeLbs} lbs`);
  if (vitals.heightIn.trim()) measureParts.push(`Height ${vitals.heightIn} in`);
  if (vitals.bmi.trim()) measureParts.push(`BMI ${vitals.bmi}`);
  if (measureParts.length) lines.push(measureParts.join(" · "));

  const vitalParts: string[] = [];
  if (vitals.temperature.trim()) vitalParts.push(`Temp ${vitals.temperature}`);
  if (vitals.pulse.trim()) vitalParts.push(`Pulse ${vitals.pulse}`);
  if (vitals.respiration.trim()) vitalParts.push(`Resp ${vitals.respiration}`);
  if (vitals.o2Sat.trim()) {
    vitalParts.push(`O2 ${vitals.o2Sat}%${vitals.o2RoomAir ? " RA" : ""}`);
  }
  if (vitalParts.length) lines.push(vitalParts.join(" · "));

  const curBp =
    vitals.currentBpSystolic.trim() || vitals.currentBpDiastolic.trim()
      ? `BP ${vitals.currentBpSystolic || "—"}/${vitals.currentBpDiastolic || "—"}`
      : "";
  const bpMeta: string[] = [];
  if (vitals.bpPosition) bpMeta.push(vitals.bpPosition);
  if (vitals.bpArm) bpMeta.push(`${vitals.bpArm} arm`);
  if (curBp) {
    lines.push(`${curBp}${bpMeta.length ? ` (${bpMeta.join(", ")})` : ""}`);
  }

  return lines.join("\n");
}
