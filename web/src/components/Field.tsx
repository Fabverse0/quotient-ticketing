import { useId, type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function Field({ label, error, className = "", ...rest }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-caption text-quiet">
        {label}
      </label>
      <input
        id={id}
        {...rest}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={
          "h-(--size-field) rounded-ui border bg-field px-3 text-body text-ink placeholder:text-quiet " +
          "focus:border-ink focus:shadow-(--focus-ring) focus:outline-none " +
          (error ? "border-oxblood" : "border-mist")
        }
      />
      {error && (
        <p id={errorId} className="text-caption text-oxblood">
          {error}
        </p>
      )}
    </div>
  );
}
