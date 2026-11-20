import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

type Props = (InputHTMLAttributes<HTMLInputElement> | TextareaHTMLAttributes<HTMLTextAreaElement>) & {
  label: string;
  error?: string;
  // Renders a textarea for longer text such as a description.
  multiline?: boolean;
  hint?: string;
};

const control =
  "rounded-ui border bg-field px-3 text-body text-ink placeholder:text-quiet " +
  "focus:border-ink focus:shadow-(--focus-ring) focus:outline-none ";

export function Field({ label, error, multiline = false, hint, className = "", ...rest }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-caption text-quiet">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={4}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={control + "min-h-24 py-2 " + (error ? "border-oxblood" : "border-mist")}
        />
      ) : (
        <input
          id={id}
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={control + "h-(--size-field) " + (error ? "border-oxblood" : "border-mist")}
        />
      )}
      {hint && !error && <p className="text-caption text-quiet">{hint}</p>}
      {error && (
        <p id={errorId} className="text-caption text-oxblood">
          {error}
        </p>
      )}
    </div>
  );
}
