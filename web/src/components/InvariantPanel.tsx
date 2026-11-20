import { useMutation } from "@tanstack/react-query";
import { useEffect } from "react";
import { messageFor } from "../api/errors";
import { checkInvariants, type InvariantCheck, type InvariantReport } from "../api/organizer";
import { useShake } from "../hooks/useShake";
import { formatDateTime, kindLabel } from "../lib/format";
import { CHECKS, compare, type CheckInfo } from "../lib/invariants";
import { Button } from "./Button";

function Mark({ ok, className }: { ok: boolean; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ok ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M7 7l10 10M17 7L7 17" />}
    </svg>
  );
}

// The double ring of the paid seal, in the colour of the verdict.
function Verdict({ report, at }: { report: InvariantReport; at: number }) {
  const failed = report.checks.filter((c) => !c.ok).length;
  const ring = report.ok ? "border-sage text-sage" : "border-oxblood text-oxblood";
  return (
    <div role="status" className="flex items-center gap-4">
      <span className={`flex size-14 shrink-0 items-center justify-center rounded-full border-2 p-1 ${ring}`}>
        <span className={`flex size-full items-center justify-center rounded-full border ${ring}`}>
          <Mark ok={report.ok} className="size-6" />
        </span>
      </span>
      <div>
        <p className={`text-lead font-bold ${report.ok ? "text-sage" : "text-oxblood"}`}>
          {report.ok ? "Semua cocok" : `${failed} pemeriksaan dilanggar`}
        </p>
        <p className="text-caption text-quiet">
          {report.checks.length - failed} dari {report.checks.length} lulus · diperiksa{" "}
          {formatDateTime(new Date(at).toISOString())}
        </p>
      </div>
    </div>
  );
}

function Row({ index, info, result, pending }: { index: number; info: CheckInfo; result?: InvariantCheck; pending: boolean }) {
  const failed = result?.ok === false;
  const status = result
    ? result.ok
      ? { text: "Cocok", tone: "text-sage", ok: true }
      : { text: "Dilanggar", tone: "text-oxblood", ok: false }
    : { text: pending ? "Memeriksa" : "Belum diperiksa", tone: "text-quiet", ok: undefined };
  return (
    <li className="flex flex-col gap-1 border-t border-mist py-3 first:border-t-0 first:pt-0">
      <div className="flex items-baseline gap-3">
        <span className="w-6 shrink-0 text-label tracking-label text-quiet tabular-nums">{String(index + 1).padStart(2, "0")}</span>
        <span className={failed ? "text-oxblood" : "text-ink"}>{info.label}</span>
        <span className={`ml-auto inline-flex shrink-0 items-center gap-1 text-small ${status.tone} ${failed ? "font-bold" : ""}`}>
          {status.ok !== undefined && <Mark ok={status.ok} className="size-4" />}
          {status.text}
        </span>
      </div>
      {!failed && (
        <p className="pl-9 text-caption text-quiet">{result ? compare(result.values, info.relation, true) : info.formula}</p>
      )}
      {result?.violations.map((v, i) => (
        <p key={i} className="pl-9 text-caption text-oxblood">
          {v.subject.kind ? kindLabel(v.subject.kind as "REGULAR" | "VIP") : "Satu pembeli"}:{" "}
          {compare(v.values, info.relation, false)}
        </p>
      ))}
    </li>
  );
}

export function InvariantPanel({ eventId }: { eventId: string }) {
  const { ref, shake } = useShake<HTMLElement>();
  const check = useMutation({ mutationFn: () => checkInvariants(eventId) });
  const report: InvariantReport | undefined = check.data;
  const rejected = check.isError || (report !== undefined && !report.ok);

  // After the render that adds the red border: React rewrites className, which
  // would cancel a shake started earlier.
  useEffect(() => {
    if (rejected) shake();
  }, [rejected, check.submittedAt, shake]);

  return (
    <section
      ref={ref}
      aria-labelledby="invariant-title"
      className={`flex flex-col gap-6 rounded-ui bg-wall p-6 ${report && !report.ok ? "border border-oxblood" : ""}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="invariant-title" className="text-lead font-bold text-ink">
            Pemeriksaan invariant
          </h2>
          <p className="max-w-(--width-lead) text-small text-quiet">
            Membandingkan counter kuota dengan pesanan dan tiket yang tercatat untuk event ini. Dijalankan manual.
          </p>
        </div>
        <Button variant="secondary" onClick={() => check.mutate()} busy={check.isPending} className="shrink-0">
          {check.isPending ? "Memeriksa" : "Jalankan pemeriksaan"}
        </Button>
      </div>

      {check.isError && (
        <p role="alert" className="text-small text-oxblood">
          {messageFor(check.error)}
        </p>
      )}
      {report && <Verdict report={report} at={check.submittedAt} />}

      <ol className="flex flex-col">
        {CHECKS.map((info, i) => (
          <Row
            key={info.id}
            index={i}
            info={info}
            result={report?.checks.find((c) => c.id === info.id)}
            pending={check.isPending}
          />
        ))}
      </ol>
    </section>
  );
}
