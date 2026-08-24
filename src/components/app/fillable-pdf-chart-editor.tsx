"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { PDFCheckBox, PDFDocument, PDFTextField } from "pdf-lib";
import { Button } from "@/components/ui/button";
import {
  applyPatientNamePrefill,
  type PatientNamePrefill,
} from "@/lib/fillable-pdf-prefill";
import {
  applyScoredCheckboxChange,
  formHasScoredOptions,
  isAutoScoreField,
} from "@/lib/fillable-pdf-scoring";

type OverlayField = {
  name: string;
  kind: "text" | "checkbox";
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type PageView = {
  pdfWidth: number;
  pdfHeight: number;
  dataUrl: string;
};

/** Our generator names encode the page — avoid fragile Annots/PDFDict lookups. */
function pageIndexFromFieldName(name: string, pageCount: number): number {
  // Explicit pN_ prefix (0-based), e.g. p1_surgery_0 — needed for 3+ page forms.
  const explicit = /^p(\d+)_/.exec(name);
  if (explicit) {
    const idx = Number(explicit[1]);
    if (Number.isFinite(idx) && idx >= 0 && idx < pageCount) return idx;
  }
  // Legacy 2-page naming (6MWT page 2 → index 1)
  if (
    name.endsWith("_p2") ||
    name.startsWith("t2_") ||
    name.startsWith("ordered_") ||
    name.startsWith("done_")
  ) {
    return Math.min(1, Math.max(0, pageCount - 1));
  }
  return 0;
}

export function FillablePdfChartEditor({
  pdfUrl,
  patientId,
  encounterId,
  templateId,
  label,
  patientName,
  onSaved,
  onCancel,
}: {
  pdfUrl: string;
  patientId: string;
  encounterId: string;
  templateId: string;
  label: string;
  /** Prefill patient name/DOB fields when the form opens. */
  patientName?: PatientNamePrefill | null;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blankBytes, setBlankBytes] = useState<Uint8Array | null>(null);
  const [fields, setFields] = useState<OverlayField[]>([]);
  const [pages, setPages] = useState<PageView[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(pdfUrl, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`Could not load form PDF (${res.status})`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;

        const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const form = pdfDoc.getForm();
        const pdfPages = pdfDoc.getPages();
        const pageSizes = pdfPages.map((p) => p.getSize());
        const nextFields: OverlayField[] = [];
        const nextValues: Record<string, string | boolean> = {};

        for (const field of form.getFields()) {
          try {
            const name = field.getName();
            const widgets = field.acroField.getWidgets();
            const widget = widgets[0];
            if (!widget) continue;
            const rect = widget.getRectangle();
            const pageIndex = pageIndexFromFieldName(name, pdfPages.length);

            if (field instanceof PDFTextField) {
              nextFields.push({
                name,
                kind: "text",
                pageIndex,
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              });
              nextValues[name] = "";
              try {
                nextValues[name] = field.getText() ?? "";
              } catch {
                nextValues[name] = "";
              }
            } else if (field instanceof PDFCheckBox) {
              nextFields.push({
                name,
                kind: "checkbox",
                pageIndex,
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              });
              try {
                nextValues[name] = field.isChecked();
              } catch {
                nextValues[name] = false;
              }
            }
          } catch {
            // Skip malformed widgets from the generator PDF.
          }
        }

        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const loadingTask = pdfjs.getDocument({ data: bytes.slice() });
        const pdf = await loadingTask.promise;
        const rendered: PageView[] = [];
        const scale = 1.5;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas unavailable");
          await page.render({
            canvasContext: ctx,
            viewport,
            canvas,
            // 0 = DISABLE — don't paint AcroForm chrome into the page image
            annotationMode: pdfjs.AnnotationMode?.DISABLE ?? 0,
          }).promise;
          const size = pageSizes[i - 1] ?? { width: 612, height: 792 };
          // Cover printed underscores / wingding checkbox glyphs under each field.
          const sx = canvas.width / size.width;
          const sy = canvas.height / size.height;
          ctx.fillStyle = "#ffffff";
          for (const f of nextFields.filter((field) => field.pageIndex === i - 1)) {
            const pad = f.kind === "checkbox" ? 1.5 : 0.5;
            const left = f.x * sx - pad;
            const top = (size.height - f.y - f.height) * sy - pad;
            const w = f.width * sx + pad * 2;
            const h = f.height * sy + pad * 2;
            ctx.fillRect(left, top, w, h);
          }
          rendered.push({
            pdfWidth: size.width,
            pdfHeight: size.height,
            dataUrl: canvas.toDataURL("image/jpeg", 0.92),
          });
        }

        if (cancelled) return;
        setBlankBytes(bytes);
        setFields(nextFields);
        setValues(
          patientName
            ? applyPatientNamePrefill(nextValues, patientName)
            : nextValues
        );
        setPages(rendered);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to open fillable form");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // Prefill identity from chart; depend on identity parts, not object identity.
  }, [
    pdfUrl,
    patientName?.displayName,
    patientName?.firstName,
    patientName?.lastName,
    patientName?.dateOfBirth,
  ]);

  const fieldsByPage = useMemo(() => {
    const map = new Map<number, OverlayField[]>();
    for (const f of fields) {
      const list = map.get(f.pageIndex) ?? [];
      list.push(f);
      map.set(f.pageIndex, list);
    }
    return map;
  }, [fields]);

  const setFieldValue = useCallback((name: string, value: string | boolean) => {
    setValues((prev) => {
      if (typeof value === "boolean" && formHasScoredOptions(prev)) {
        return applyScoredCheckboxChange(prev, name, value);
      }
      return { ...prev, [name]: value };
    });
  }, []);

  const handleSaveToChart = async () => {
    if (!blankBytes) return;
    setSaving(true);
    setError(null);
    try {
      const pdfDoc = await PDFDocument.load(blankBytes.slice(), { ignoreEncryption: true });
      const form = pdfDoc.getForm();
      for (const [name, value] of Object.entries(values)) {
        try {
          if (typeof value === "boolean") {
            const box = form.getCheckBox(name);
            if (value) box.check();
            else box.uncheck();
          } else {
            const text = form.getTextField(name);
            text.setText(String(value ?? ""));
            try {
              text.setFontSize(9.5);
            } catch {
              // some appearances reject font size
            }
          }
        } catch {
          // skip unknown/mismatched fields
        }
      }
      const saved = await pdfDoc.save();
      const file = new File([Uint8Array.from(saved)], `${label.replace(/[^\w.-]+/g, "_")}.pdf`, {
        type: "application/pdf",
      });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("templateId", templateId);
      const res = await fetch(
        `/api/patients/${patientId}/encounters/${encounterId}/forms/upload`,
        { method: "POST", body: fd, credentials: "include" }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Save failed (${res.status})`);
      }
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save form to chart");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-[var(--pv-muted)]">
        <Loader2 className="animate-spin" size={28} />
        <p className="text-sm">Loading fillable form…</p>
      </div>
    );
  }

  if (error && pages.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-rose-300">{error}</p>
        <Button onClick={onCancel}>Close</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--pv-border)] bg-[var(--pv-card)] pb-3">
        <p className="text-xs text-[var(--pv-muted-2)]">
          Fill the fields on the form, then click Save to chart.
        </p>
        <div className="flex gap-2">
          <Button className="!h-9" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="success"
            className="!h-9 gap-1.5"
            disabled={saving || pages.length === 0}
            onClick={() => void handleSaveToChart()}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save to chart
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-rose-300">{error}</p>}

      <div className="flex flex-col gap-6">
        {pages.map((page, pageIndex) => (
          <div
            key={pageIndex}
            className="relative mx-auto w-full max-w-[900px] overflow-hidden rounded border border-[var(--pv-border)] bg-white shadow"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={page.dataUrl}
              alt={`${label} page ${pageIndex + 1}`}
              className="block h-auto w-full select-none"
              draggable={false}
            />
            <PageFieldOverlay
              fields={fieldsByPage.get(pageIndex) ?? []}
              pdfWidth={page.pdfWidth}
              pdfHeight={page.pdfHeight}
              values={values}
              onChange={setFieldValue}
              disabled={saving}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function PageFieldOverlay({
  fields,
  pdfWidth,
  pdfHeight,
  values,
  onChange,
  disabled,
}: {
  fields: OverlayField[];
  pdfWidth: number;
  pdfHeight: number;
  values: Record<string, string | boolean>;
  onChange: (name: string, value: string | boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {fields.map((f) => {
        const left = (f.x / pdfWidth) * 100;
        const top = ((pdfHeight - f.y - f.height) / pdfHeight) * 100;
        const width = (f.width / pdfWidth) * 100;
        const height = (f.height / pdfHeight) * 100;
        const style = {
          left: `${left}%`,
          top: `${top}%`,
          width: `${width}%`,
          height: `${height}%`,
        } as const;

        if (f.kind === "checkbox") {
          return (
            <label
              key={f.name}
              className="pointer-events-auto absolute flex items-center justify-center"
              style={style}
              title={f.name}
            >
              <input
                type="checkbox"
                className="h-[78%] max-h-[14px] w-[78%] max-w-[14px] cursor-pointer appearance-none rounded-[2px] border border-slate-600 bg-white checked:border-cyan-700 checked:bg-cyan-600 checked:bg-[length:100%_100%] checked:bg-center checked:bg-no-repeat"
                style={{
                  backgroundImage: values[f.name]
                    ? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='none' stroke='white' stroke-width='2.5' d='M3 8l3.5 3.5L13 4'/%3E%3C/svg%3E\")"
                    : undefined,
                }}
                checked={Boolean(values[f.name])}
                disabled={disabled}
                onChange={(e) => onChange(f.name, e.target.checked)}
              />
            </label>
          );
        }

        return (
          <input
            key={f.name}
            type="text"
            readOnly={isAutoScoreField(f.name)}
            className={
              isAutoScoreField(f.name)
                ? "pointer-events-none absolute box-border rounded-[1px] border border-emerald-700/40 bg-emerald-50/90 px-0.5 text-center text-[clamp(8px,1.15vw,12px)] font-semibold leading-tight text-black outline-none"
                : "pointer-events-auto absolute box-border rounded-[1px] border border-amber-600/35 bg-amber-100/80 px-0.5 text-[clamp(7px,1.05vw,10px)] leading-tight text-black outline-none focus:border-cyan-600 focus:bg-amber-50"
            }
            style={style}
            value={String(values[f.name] ?? "")}
            disabled={disabled}
            onChange={(e) => onChange(f.name, e.target.value)}
            title={isAutoScoreField(f.name) ? "Auto-calculated from choices" : undefined}
          />
        );
      })}
    </div>
  );
}
