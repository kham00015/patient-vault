import type { VisitCategory } from "./encounters";

export type ChartNavigationIntent = {
  fromSchedule?: boolean;
  scheduleDate?: string;
  visitCategory?: VisitCategory;
  /** Open a specific encounter (e.g. from unsigned-notes alerts). */
  encounterId?: string;
  /** Expand the Notes branch after opening the encounter. */
  openNotesBranch?: boolean;
  /** Open the primary note for the encounter. */
  openNote?: boolean;
  /** Jump to the Documents tab. */
  chartTab?: "documents" | "encounters" | "notes" | "orders" | "studies";
  /** Open a document from the chart documents list (id may be `form:…` / `note:…`). */
  documentId?: string;
};
