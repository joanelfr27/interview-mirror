"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Props = { sessionId: string; isFrench: boolean };

export function RetestButton({ sessionId, isFrench }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRetest() {
    setLoading(true);
    try {
      const response = await fetch(`/api/interview/retest/${sessionId}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.sessionId) throw new Error(data.error || (isFrench ? "Impossible de préparer le prochain entretien." : "Could not prepare the next interview."));
      router.push(`/interview/${data.sessionId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isFrench ? "Impossible de préparer le prochain entretien." : "Could not prepare the next interview."));
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleRetest} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
      {loading ? (isFrench ? "Préparation…" : "Preparing…") : (isFrench ? "Retester les points faibles" : "Retest weak areas")}
    </Button>
  );
}
