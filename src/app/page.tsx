"use client";

import { useSyncExternalStore } from "react";
import { Planner } from "@/components/planner";

const subscribe = () => () => {};

export default function Page() {
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return ready ? (
    <Planner />
  ) : (
    <main className="loading">
      <span className="brand-mark">M</span>
      <h1>MMF Studio</h1>
      <p>Opening your private workspace...</p>
    </main>
  );
}
