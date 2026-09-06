"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CoachingPracticeButton({
  sourceSessionId,
  focusArea,
}: {
  sourceSessionId: string;
  focusArea: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function startPractice() {
    setLoading(true);
    try {
      const response = await fetch("/api/coaching/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceSessionId, focusArea }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not start practice");
      }

      router.push(`/interview/${data.sessionId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start practice");
      setLoading(false);
    }
  }

  return (
    <Button onClick={startPractice} disabled={loading}>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Target className="h-4 w-4" />
      )}
      {loading ? "Preparing practice…" : "Practice this skill"}
    </Button>
  );
}
