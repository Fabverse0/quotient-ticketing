import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { messageFor } from "../api/errors";
import { createEvent } from "../api/organizer";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { useShake } from "../hooks/useShake";
import { wibInputToIso } from "../lib/format";

const MAX_PRICE = 100_000_000;
const MAX_QUOTA = 1_000_000;

interface Values {
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  regularPrice: string;
  regularQuota: string;
  vipPrice: string;
  vipQuota: string;
}
type Errors = Partial<Record<keyof Values, string>>;

const EMPTY: Values = {
  title: "",
  description: "",
  venue: "",
  startsAt: "",
  regularPrice: "",
  regularQuota: "",
  vipPrice: "",
  vipQuota: "",
};

const whole = (v: string) => /^\d+$/.test(v.trim());

function validate(v: Values): Errors {
  const e: Errors = {};
  if (!v.title.trim()) e.title = "Isi nama event.";
  else if (v.title.trim().length > 200) e.title = "Nama event maksimal 200 karakter.";
  if (v.description.trim().length > 5000) e.description = "Deskripsi maksimal 5.000 karakter.";
  if (!v.venue.trim()) e.venue = "Isi tempat event.";
  if (!v.startsAt) e.startsAt = "Pilih tanggal dan jam mulai.";
  for (const [key, label, max] of [
    ["regularPrice", "Harga", MAX_PRICE],
    ["regularQuota", "Kuota", MAX_QUOTA],
    ["vipPrice", "Harga", MAX_PRICE],
    ["vipQuota", "Kuota", MAX_QUOTA],
  ] as const) {
    if (!whole(v[key])) e[key] = `${label} berupa bilangan bulat, 0 atau lebih.`;
    else if (Number(v[key]) > max) e[key] = `${label} maksimal ${max.toLocaleString("id-ID")}.`;
  }
  return e;
}

export function CreateEventPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { ref, shake } = useShake<HTMLFormElement>();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});

  const create = useMutation({
    mutationFn: (v: Values) =>
      createEvent({
        title: v.title.trim(),
        description: v.description.trim(),
        venue: v.venue.trim(),
        startsAt: wibInputToIso(v.startsAt),
        ticketTypes: [
          { kind: "REGULAR", price: Number(v.regularPrice), quota: Number(v.regularQuota) },
          { kind: "VIP", price: Number(v.vipPrice), quota: Number(v.vipQuota) },
        ],
      }),
    onSuccess: (event) => {
      void queryClient.invalidateQueries({ queryKey: ["organizer-events"] });
      void queryClient.invalidateQueries({ queryKey: ["events"] });
      navigate(`/organizer/event/${event.id}`);
    },
    onError: shake,
  });

  const set = (key: keyof Values) => (event: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [key]: event.target.value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);
    create.reset();
    if (Object.keys(found).length > 0) {
      shake();
      return;
    }
    create.mutate(values);
  };

  const box = (kind: "regular" | "vip", title: string) => (
    <fieldset className="flex flex-col gap-4 rounded-ui border border-mist p-4">
      <legend className="px-1 text-small text-ink">{title}</legend>
      <Field
        label="Harga (Rp)"
        inputMode="numeric"
        placeholder={kind === "regular" ? "150000" : "450000"}
        value={values[`${kind}Price`]}
        onChange={set(`${kind}Price`)}
        error={errors[`${kind}Price`]}
      />
      <Field
        label="Kuota"
        inputMode="numeric"
        placeholder={kind === "regular" ? "120" : "30"}
        value={values[`${kind}Quota`]}
        onChange={set(`${kind}Quota`)}
        error={errors[`${kind}Quota`]}
      />
    </fieldset>
  );

  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="text-title font-bold text-ink">Buat event</h1>
      <p className="mt-1 text-small text-quiet">Satu event punya dua tipe tiket: Reguler dan VIP. Waktu dibaca sebagai WIB.</p>

      <form ref={ref} onSubmit={onSubmit} noValidate className="rise mt-6 flex flex-col gap-5 rounded-card bg-wall p-6 sm:p-8">
        <Field label="Nama event" placeholder="Malam Jazz Kota Lama" value={values.title} onChange={set("title")} error={errors.title} />
        <Field
          label="Deskripsi"
          multiline
          placeholder="Apa yang akan terjadi, dan jam pintu dibuka."
          value={values.description}
          onChange={set("description")}
          error={errors.description}
        />
        <Field label="Tempat" placeholder="Gedung Serbaguna, Semarang" value={values.venue} onChange={set("venue")} error={errors.venue} />
        <Field
          label="Mulai"
          type="datetime-local"
          value={values.startsAt}
          onChange={set("startsAt")}
          error={errors.startsAt}
          hint="Waktu dalam WIB."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          {box("regular", "Reguler")}
          {box("vip", "VIP")}
        </div>

        {create.isError && (
          <p role="alert" className="text-small text-oxblood">
            {messageFor(create.error)}
          </p>
        )}
        <Button type="submit" busy={create.isPending} className="w-full sm:w-auto sm:self-start">
          {create.isPending ? "Membuat" : "Buat event"}
        </Button>
      </form>
    </section>
  );
}
