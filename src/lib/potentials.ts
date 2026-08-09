export type PotentialPatientDTO = {
  id: string;
  name: string;
  mrn: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toPotentialPatientDTO(row: {
  id: string;
  name: string;
  mrn: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PotentialPatientDTO {
  return {
    id: row.id,
    name: row.name,
    mrn: row.mrn,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
