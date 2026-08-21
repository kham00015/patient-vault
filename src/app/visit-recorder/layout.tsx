import type { Metadata, Viewport } from "next";
import { APP_NAME } from "@/lib/branding";

export const metadata: Metadata = {
  title: `Visit recorder — ${APP_NAME}`,
  description: "Record a visit for audio, transcript, and HPI draft",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0b1220",
};

export default function VisitRecorderLayout({ children }: { children: React.ReactNode }) {
  return children;
}
