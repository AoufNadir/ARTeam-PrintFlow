# ARTeam PrintFlow - Supabase and Free Domain Setup

## 1. Supabase

1. Create a free project at Supabase.
2. Open SQL Editor and run `app/supabase/schema.sql`.
3. In Authentication, create a user with email and password.
4. Copy `app/.env.example` to `app/.env`.
5. Fill:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

6. Restart the dev server.
7. Sign in with the Supabase email/password, then open Settings -> Database and push the local snapshot.

The demo login buttons stay local and do not sync data to Supabase.

## 2. Free professional URL

Use Vercel free Hobby hosting:

1. Push this repository to GitHub.
2. Import the repository in Vercel.
3. Vercel reads `vercel.json`.
4. Add the same environment variables in Vercel Project Settings.
5. Deploy.

You will get a free URL like:

```text
https://arteam-printflow.vercel.app
```

A real custom domain like `.com`, `.net`, or `.dz` normally requires buying the domain. Hosting it on Vercel can remain free, but owning the domain name itself is not usually free.
