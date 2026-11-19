import { useCallback, useRef } from "react";

// Restarts the shake keyframes on the element, even when it is already shaking.
export function useShake<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const shake = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("shake");
    void el.offsetWidth;
    el.classList.add("shake");
  }, []);
  return { ref, shake };
}
