"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTACT_TYPES,
  type ContactDTO,
  type ContactTypeValue,
  getContactTypeBadge,
  getContactTypeLabel,
  showsCompanyDrugFields,
} from "@/lib/contacts";
import { cn } from "@/lib/utils";
import { MapPin, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";

type ContactFormState = {
  name: string;
  type: ContactTypeValue;
  location: string;
  phone: string;
  notes: string;
  company: string;
  drug: string;
};

const emptyForm = (): ContactFormState => ({
  name: "",
  type: "REFERRAL_SPECIALIST",
  location: "",
  phone: "",
  notes: "",
  company: "",
  drug: "",
});

function contactToForm(contact: ContactDTO): ContactFormState {
  return {
    name: contact.name,
    type: contact.type,
    location: contact.location ?? "",
    phone: contact.phone ?? "",
    notes: contact.notes ?? "",
    company: contact.company ?? "",
    drug: contact.drug ?? "",
  };
}

function ContactForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  saving,
}: {
  form: ContactFormState;
  onChange: (next: ContactFormState) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  saving: boolean;
}) {
  const showCompanyDrug = showsCompanyDrugFields(form.type);

  return (
    <div className="grid max-w-2xl gap-3">
      <Input
        placeholder="Name *"
        value={form.name}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
      />
      <label className="block text-xs text-[#6b7c93]">
        Type
        <select
          className="mt-1 w-full rounded-lg border border-[#2d3f57] bg-[#0d1219] px-3 py-2 text-sm"
          value={form.type}
          onChange={(e) => onChange({ ...form, type: e.target.value as ContactTypeValue })}
        >
          {CONTACT_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <Input
        placeholder="Location (practice, city, address)"
        value={form.location}
        onChange={(e) => onChange({ ...form, location: e.target.value })}
      />
      <Input
        placeholder="Phone"
        value={form.phone}
        onChange={(e) => onChange({ ...form, phone: e.target.value })}
      />
      {showCompanyDrug && (
        <>
          <Input
            placeholder={form.type === "PHARMA_REP" ? "Company" : "Practice / group"}
            value={form.company}
            onChange={(e) => onChange({ ...form, company: e.target.value })}
          />
          <Input
            placeholder={form.type === "PHARMA_REP" ? "Drug / product line" : "Specialty"}
            value={form.drug}
            onChange={(e) => onChange({ ...form, drug: e.target.value })}
          />
        </>
      )}
      <Textarea
        placeholder="Notes"
        value={form.notes}
        onChange={(e) => onChange({ ...form, notes: e.target.value })}
        className="min-h-[88px]"
      />
      <div className="flex gap-2">
        <Button variant="success" className="!text-xs" disabled={saving || !form.name.trim()} onClick={onSubmit}>
          {saving ? "Saving..." : submitLabel}
        </Button>
        <Button className="!text-xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function ContactsPanel({ canEdit }: { canEdit: boolean }) {
  const [contacts, setContacts] = useState<ContactDTO[]>([]);
  const [typeFilter, setTypeFilter] = useState<ContactTypeValue | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (typeFilter !== "ALL") params.set("type", typeFilter);
    if (search.trim()) params.set("q", search.trim());
    const data = await api<{ contacts: ContactDTO[] }>(
      `/api/contacts${params.toString() ? `?${params}` : ""}`
    );
    setContacts(data.contacts);
  }, [search, typeFilter]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      load()
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  function resetForm() {
    setForm(emptyForm());
    setComposing(false);
    setEditingId(null);
  }

  async function createContact() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api("/api/contacts", {
        method: "POST",
        json: {
          name: form.name,
          type: form.type,
          location: form.location || undefined,
          phone: form.phone || undefined,
          notes: form.notes || undefined,
          company: form.company || undefined,
          drug: form.drug || undefined,
        },
      });
      resetForm();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function updateContact(id: string) {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api(`/api/contacts/${id}`, {
        method: "PATCH",
        json: {
          name: form.name,
          type: form.type,
          location: form.location || null,
          phone: form.phone || null,
          notes: form.notes || null,
          company: form.company || null,
          drug: form.drug || null,
        },
      });
      resetForm();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteContact(id: string) {
    await api(`/api/contacts/${id}`, { method: "DELETE" });
    if (editingId === id) resetForm();
    await load();
  }

  function startEdit(contact: ContactDTO) {
    setComposing(false);
    setEditingId(contact.id);
    setForm(contactToForm(contact));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <p className="mb-4 text-xs text-[#6b7c93]">
        Clinic directory for referral specialists, pharma reps, labs, and other contacts.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1 max-w-md">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7c93]" />
          <Input
            className="!pl-9"
            placeholder="Search name, company, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canEdit && (
          <Button
            variant="success"
            className="!ml-auto !text-xs"
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm());
              setComposing((value) => !value);
            }}
          >
            <Plus size={14} /> New Contact
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variant={typeFilter === "ALL" ? "primary" : "ghost"}
          className="!text-xs"
          onClick={() => setTypeFilter("ALL")}
        >
          All
        </Button>
        {CONTACT_TYPES.map((item) => (
          <Button
            key={item.value}
            variant={typeFilter === item.value ? "primary" : "ghost"}
            className="!text-xs"
            onClick={() => setTypeFilter(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {(composing || editingId) && canEdit && (
        <div className="mb-4 rounded-xl border border-[#243044] bg-[#0f1520] p-4">
          <p className="mb-3 text-sm font-medium text-cyan-200">
            {editingId ? "Edit contact" : "New contact"}
          </p>
          <ContactForm
            form={form}
            onChange={setForm}
            saving={saving}
            submitLabel={editingId ? "Save Changes" : "Add Contact"}
            onSubmit={() => (editingId ? updateContact(editingId) : createContact())}
            onCancel={resetForm}
          />
        </div>
      )}

      {loading && <p className="text-sm text-[#6b7c93]">Loading contacts...</p>}

      {!loading && contacts.length === 0 && (
        <p className="rounded-xl border border-dashed border-[#243044] px-4 py-8 text-center text-sm text-[#6b7c93]">
          No contacts found{typeFilter !== "ALL" ? ` in ${getContactTypeLabel(typeFilter)}` : ""}.
        </p>
      )}

      <div className="min-h-0 flex-1 space-y-2">
        {contacts.map((contact) => (
          <div key={contact.id} className="rounded-xl border border-[#243044] bg-[#0f1520] px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-cyan-200">{contact.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1",
                      getContactTypeBadge(contact.type)
                    )}
                  >
                    {getContactTypeLabel(contact.type)}
                  </span>
                </div>
                {(contact.company || contact.drug) && (
                  <p className="mt-1 text-sm text-[#b8c5d6]">
                    {[contact.company, contact.drug].filter(Boolean).join(" · ")}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8b9cb3]">
                  {contact.location && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} className="text-[#6b7c93]" />
                      {contact.location}
                    </span>
                  )}
                  {contact.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone size={12} className="text-[#6b7c93]" />
                      {contact.phone}
                    </span>
                  )}
                </div>
                {contact.notes && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-[#8b9cb3]">{contact.notes}</p>
                )}
              </div>
              {canEdit && (
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" className="!text-xs" onClick={() => startEdit(contact)}>
                    <Pencil size={12} />
                  </Button>
                  <Button variant="danger" className="!text-xs" onClick={() => deleteContact(contact.id)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
