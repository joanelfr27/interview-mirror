import { Suspense } from "react";
import PrepareForm from "./prepare-form";

export default function PreparePage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center text-muted-foreground">Loading…</div>
      }
    >
      <PrepareForm />
    </Suspense>
  );
}
