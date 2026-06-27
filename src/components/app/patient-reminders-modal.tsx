"use client";

import { Modal } from "@/components/ui/modal";
import { RemindersContent } from "@/components/app/reminders-panel";
import { formatDisplayName } from "@/lib/patient-registration";

type PatientOption = { id: string; name: string };

export function PatientRemindersModal({
  open,
  onClose,
  patient,
  patients,
  refreshKey,
  onMutate,
  canEdit,
}: {
  open: boolean;
  onClose: () => void;
  patient: PatientOption;
  patients: PatientOption[];
  refreshKey: number;
  onMutate: () => void;
  canEdit: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={`Reminders — ${formatDisplayName(patient)}`} wide>
      <RemindersContent
        patients={patients}
        patientId={patient.id}
        refreshKey={refreshKey}
        onMutate={onMutate}
        canEdit={canEdit}
        showPatientColumn={false}
      />
    </Modal>
  );
}
