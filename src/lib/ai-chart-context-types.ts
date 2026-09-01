/** Client-safe Bedrock attachment types (no server imports). */

export type BedrockDocumentFormat =
  | "pdf"
  | "csv"
  | "doc"
  | "docx"
  | "xls"
  | "xlsx"
  | "html"
  | "txt"
  | "md";

export type BedrockImageFormat = "png" | "jpeg" | "gif" | "webp";

export type ChartDocumentAttachment =
  | {
      kind: "document";
      name: string;
      format: BedrockDocumentFormat;
      bytes: Uint8Array;
    }
  | {
      kind: "image";
      name: string;
      format: BedrockImageFormat;
      bytes: Uint8Array;
    };

export type PatientChartAiContext = {
  text: string;
  attachments: ChartDocumentAttachment[];
  attachmentSummary: string[];
  skipped: string[];
  coverage: {
    notes: number;
    forms: number;
    orders: number;
    encounters: number;
    documentsTotal: number;
    documentsAttached: number;
    documentsInlined: number;
    documentsExtracted: number;
    documentsSkipped: number;
  };
};
