import {
  SYMBOL_QUARTERS,
  SYMBOL_TAIL,
  SYMBOL_TRANSFORM,
  WORDMARK_PATH,
  WORDMARK_VIEWBOX,
} from "./logoShapes";

// Three shares of the ring stay, the fourth leaves as the tail of the Q.
// The viewBox crops to the drawn shape, so `size-*` is the height of the mark itself.
export function LogoMark({ className, tailClassName = "fill-umber" }: { className?: string; tailClassName?: string }) {
  return (
    <svg viewBox="24.78 24.78 206.43 206.43" aria-hidden="true" focusable="false" className={className}>
      <g transform={SYMBOL_TRANSFORM}>
        <g fill="currentColor">
          {SYMBOL_QUARTERS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <rect {...SYMBOL_TAIL} className={tailClassName} />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <svg viewBox={WORDMARK_VIEWBOX} aria-hidden="true" focusable="false" className={className}>
      <path d={WORDMARK_PATH} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}

// The wordmark drops out on phones, where the mark alone carries the brand.
export function Logo() {
  return (
    <span className="flex items-center gap-3">
      <LogoMark className="size-9" />
      <Wordmark className="hidden h-5 w-auto sm:block" />
    </span>
  );
}

// A ticket whose perforation is the bar of a division sign. For empty states.
export function TicketOrnament({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true" focusable="false" className={className}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinejoin="round"
        d="M34 52 H222 A14 14 0 0 1 236 66 V110 A18 18 0 0 0 236 146 V190 A14 14 0 0 1 222 204 H34 A14 14 0 0 1 20 190 V146 A18 18 0 0 0 20 110 V66 A14 14 0 0 1 34 52 Z"
      />
      <path
        fill="currentColor"
        d="M118 98 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0 Z M118 158 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0 Z M62 124 h28 v8 h-28 Z M114 124 h28 v8 h-28 Z M166 124 h28 v8 h-28 Z"
      />
    </svg>
  );
}
