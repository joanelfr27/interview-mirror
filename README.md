# Interview Mirror

AI-powered interview coaching. Upload your CV, paste a job description, get evidence-first analysis, practice with a tailored simulator, and receive actionable feedback.

## Stack

- **Next.js 15** (App Router) + TypeScript
- **Tailwind CSS** + **shadcn/ui**
- **Supabase** (Auth + Postgres)
- **OpenAI** (CV analysis, questions, feedback)

## Features

- Landing page with brand-forward hero
- Email/password authentication
- Dashboard of coaching sessions
- CV upload / paste + job description
- AI CV × role analysis
- Interview simulator
- Feedback page with scores and coaching notes
- Responsive blue & white theme

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional service role key |
| `OPENAI_API_KEY` | OpenAI API key |
| `NEXT_PUBLIC_APP_URL` | App URL (e.g. `http://localhost:3000`) |

Without `OPENAI_API_KEY`, analysis / interview / feedback still run using deterministic fallbacks so you can develop the UI offline.

### 3. Database

In the Supabase SQL editor, run:

[`supabase/schema.sql`](supabase/schema.sql)

Enable Email auth in **Authentication → Providers**.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
src/
  app/
    (app)/           # Authenticated routes
      dashboard/
      prepare/
      analysis/[id]/
      interview/[id]/
      feedback/[id]/
    api/             # Analyze, interview, feedback, auth
    login/ signup/
  components/        # UI + layout
  lib/               # Supabase, OpenAI, utils
  types/
supabase/
  schema.sql
```

## Flow

1. Sign up / sign in  
2. **Prepare** — CV + job description → AI analysis  
3. Review **Analysis** → start **Interview**  
4. Answer questions → **Feedback**

---

© Interview Mirror — Evidence before conclusions. AI assists, you decide.
