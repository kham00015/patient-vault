import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import PatientVaultApp from "@/components/app/patient-vault-app";

export default async function AppPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <PatientVaultApp user={user} />;
}
