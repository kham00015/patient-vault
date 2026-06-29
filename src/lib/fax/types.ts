export type FaxProviderName = "mock" | "faxplus";

export type SendFaxInput = {
  toNumber: string;
  toName?: string;
  fileName: string;
  fileBuffer: Buffer;
  mimeType: string;
  coverSheet?: string;
  fromName?: string;
};

export type SendFaxResult = {
  providerJobId: string;
  status: "QUEUED" | "SENDING" | "DELIVERED";
  pageCount?: number;
};

export type FaxProviderConfig = {
  provider: FaxProviderName;
  configured: boolean;
  fromNumber?: string | null;
  fromName?: string | null;
  mode: "live" | "mock";
};
