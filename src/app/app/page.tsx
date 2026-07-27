import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import PatientVaultApp from "@/components/app/patient-vault-app";

export const dynamic = "force-dynamic";

export default async function AppPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const sessionTimeoutMinutes = parseInt(process.env.SESSION_TIMEOUT_MINUTES ?? "5", 10);
  return <PatientVaultApp user={user} sessionTimeoutMinutes={sessionTimeoutMinutes} />;
}
