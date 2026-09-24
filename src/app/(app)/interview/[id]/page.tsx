import InterviewSimulator from "./interview-simulator";

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InterviewSimulator sessionId={id} />;
}
