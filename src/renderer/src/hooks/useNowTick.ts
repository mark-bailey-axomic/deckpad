import { useEffect, useState } from 'react';

/** 1 s tick driving elapsed timers only (per spec — never log generation). */
export function useNowTick(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [enabled]);
  return now;
}
