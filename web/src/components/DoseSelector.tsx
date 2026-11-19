// Four boxes for 1 to 4 tickets: the per-buyer limit is visible in the control
// itself. Native radios, so arrow keys and screen readers work as usual.
const DOSES = [1, 2, 3, 4] as const;

export function DoseSelector({
  value,
  max,
  onChange,
}: {
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-caption text-quiet">Jumlah tiket</legend>
      <div className="flex gap-2">
        {DOSES.map((dose) => {
          const disabled = dose > max;
          return (
            <label key={dose} className={disabled ? "cursor-not-allowed" : ""}>
              <input
                type="radio"
                name="dose"
                value={dose}
                checked={value === dose}
                disabled={disabled}
                onChange={() => onChange(dose)}
                className="peer sr-only"
              />
              <span
                className={
                  "flex size-(--size-dose) items-center justify-center rounded-ui border font-display text-lead " +
                  "transition-colors duration-(--dur-fast) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink " +
                  "peer-checked:border-ink peer-checked:bg-ink peer-checked:text-canvas " +
                  "peer-disabled:border-mist peer-disabled:text-ash " +
                  "border-mist text-ink hover:bg-wash peer-checked:hover:bg-ink"
                }
              >
                {dose}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
