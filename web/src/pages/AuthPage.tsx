import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { login, register } from "../api/auth";
import { ApiError, messageFor } from "../api/errors";
import { homeFor, useSession } from "../auth/session";
import { Button } from "../components/Button";
import { Cover } from "../components/Cover";
import { Field } from "../components/Field";
import { useShake } from "../hooks/useShake";

type Mode = "login" | "register";
type Values = { name: string; email: string; password: string };
type Errors = Partial<Record<keyof Values, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(mode: Mode, v: Values): Errors {
  const errors: Errors = {};
  if (mode === "register" && !v.name.trim()) errors.name = "Isi nama kamu.";
  if (!EMAIL.test(v.email.trim())) errors.email = "Tulis email yang lengkap, misalnya nama@contoh.com.";
  if (!v.password) errors.password = "Isi password.";
  else if (mode === "register" && v.password.length < 8) errors.password = "Password minimal 8 karakter.";
  return errors;
}

const tab = (active: boolean) =>
  `border-b pb-2 text-body ${active ? "border-ink text-ink" : "border-transparent text-quiet hover:text-ink"}`;

export function AuthPage({ mode }: { mode: Mode }) {
  const { user, signIn } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const { ref: formRef, shake } = useShake<HTMLFormElement>();
  const [values, setValues] = useState<Values>({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});

  const submit = useMutation({
    mutationFn: (v: Values) =>
      mode === "login"
        ? login({ email: v.email.trim(), password: v.password })
        : register({ name: v.name.trim(), email: v.email.trim(), password: v.password }),
    onSuccess: ({ token, user: signedIn }) => {
      signIn(token, signedIn);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && signedIn.role === "buyer" ? from : homeFor(signedIn), { replace: true });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "VALIDATION_ERROR") setErrors(error.fields as Errors);
      shake();
    },
  });

  if (user) return <Navigate to={homeFor(user)} replace />;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate(mode, values);
    setErrors(found);
    submit.reset();
    if (Object.keys(found).length > 0) {
      shake();
      return;
    }
    submit.mutate(values);
  };

  const set = (key: keyof Values) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: event.target.value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const formError =
    submit.isError && !(submit.error instanceof ApiError && submit.error.code === "VALIDATION_ERROR")
      ? messageFor(submit.error)
      : undefined;

  return (
    <div className="grid gap-12 py-10 md:grid-cols-2 md:items-center md:py-16">
      <div className="hidden justify-center rounded-ui bg-wall px-10 py-16 md:flex">
        <Cover seed="quotient-auth" className="aspect-[4/5] w-1/2" />
      </div>

      <div className="mx-auto w-full max-w-(--width-form)">
        <nav aria-label="Masuk atau daftar" className="mb-8 flex gap-6">
          <Link to="/masuk" replace className={tab(mode === "login")} aria-current={mode === "login" ? "page" : undefined}>
            Masuk
          </Link>
          <Link
            to="/daftar"
            replace
            className={tab(mode === "register")}
            aria-current={mode === "register" ? "page" : undefined}
          >
            Daftar
          </Link>
        </nav>

        <h1 className="font-display text-title text-ink">
          {mode === "login" ? "Selamat datang kembali" : "Buat akun pembeli"}
        </h1>

        <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-5">
          {mode === "register" && (
            <Field label="Nama" name="name" autoComplete="name" placeholder="Ayu Lestari" value={values.name} onChange={set("name")} error={errors.name} />
          )}
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="ayu@contoh.com"
            value={values.email}
            onChange={set("email")}
            error={errors.email}
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={mode === "register" ? "Minimal 8 karakter" : undefined}
            value={values.password}
            onChange={set("password")}
            error={errors.password}
          />

          {formError && (
            <p role="alert" className="text-small text-oxblood">
              {formError}
            </p>
          )}

          <Button type="submit" busy={submit.isPending} className="mt-2 w-full">
            {submit.isPending ? "Memproses" : mode === "login" ? "Masuk" : "Buat akun"}
          </Button>
        </form>

        <p className="mt-6 text-caption text-quiet">
          Akun organizer dibuat oleh admin. Pendaftaran di sini hanya untuk pembeli.
        </p>
      </div>
    </div>
  );
}
