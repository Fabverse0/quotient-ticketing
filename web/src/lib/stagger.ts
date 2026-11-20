import type { CSSProperties } from "react";

// Position in a group of cards that arrive together, read by the .rise class.
export const stagger = (index: number) => ({ "--i": index }) as CSSProperties;
