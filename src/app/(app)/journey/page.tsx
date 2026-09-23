import { createClient } from "@/lib/supabase/server";
import JourneySelector from "./journey-selector";
import type { SessionRecord } from "@/types";

export default async function JourneyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase.rpc("get_candidate_preparation_context", {
    p_user_id: user.id,
  });

  const context = (data ?? { sessions: [], coaching_progress: [] }) as {
    sessions: SessionRecord[];
    coaching_progress: Array<{
      id: string;
      focus_area: string;
      status: string;
      updated_at: string;
    }>;
  };

  const sessions = [...(context.sessions ?? [])].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );

  const upcoming = sessions.find(
    (session) => session.preparation_purpose === "upcoming_interview" &&
      session.status !== "completed"
  );

  const skills = sessions.find(
    (session) => session.preparation_purpose === "improve_skills" &&
      session.status !== "completed"
  );

  return (
    <JourneySelector
      hasCandidateHistory={sessions.length > 0}
      resumableUpcomingSessionId={upcoming?.id ?? null}
      resumableSkillsSessionId={skills?.id ?? null}
      upcomingTitle={upcoming?.title ?? null}
      skillsTitle={skills?.title ?? null}
      focusArea={context.coaching_progress?.[0]?.focus_area ?? null}
    />
  );
}
