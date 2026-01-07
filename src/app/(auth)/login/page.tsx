"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { getSupabaseClient } from "@/lib/supabase";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const router = useRouter();
  const { user, loading } = useAuth();

  const canSubmit = useMemo(
    () => username.trim().length > 0 && password.trim().length > 0 && !busy,
    [username, password, busy],
  );

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (username.trim() !== "puppy" || password.trim() !== "chandana") {
      setError("Invalid Username or Password");
      return;
    }

    try {
      setBusy(true);
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error(
          "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Netlify and redeploy.",
        );
      }

      const email = "puppy@puppy.com";
      const supabasePassword = "chandana";

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password: supabasePassword,
      });

      if (signInErr) {
        const msg = typeof (signInErr as any)?.message === "string" ? String((signInErr as any).message) : "";
        const shouldTrySignup =
          msg.toLowerCase().includes("invalid login") ||
          msg.toLowerCase().includes("invalid credentials") ||
          msg.toLowerCase().includes("user not found") ||
          msg.toLowerCase().includes("email not confirmed");

        if (!shouldTrySignup) throw signInErr;

        const { error: signUpErr } = await supabase.auth.signUp({
          email,
          password: supabasePassword,
        });
        if (signUpErr) throw signUpErr;

        const { error: signInErr2 } = await supabase.auth.signInWithPassword({
          email,
          password: supabasePassword,
        });
        if (signInErr2) throw signInErr2;
      }

      router.replace("/dashboard");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
      setError(`Error: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)]">
      <div className="mx-auto flex min-h-screen max-w-[1080px] items-center px-4 py-10">
        <div className="grid w-full gap-6 lg:grid-cols-2">
          <div className="hidden lg:block">
            <div className="rounded-3xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-8 shadow-[var(--shadow)]">
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--app-fg)]">
                Study smarter.
                <br />
                Practice faster.
              </h1>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-fg)]">
                A modern web experience for NEET PG practice — subjects, MCQs,
                bookmarks and PrepDNA insights.
              </p>

              <div className="mt-8 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--soft-bg)] p-4">
                  <div className="text-xs text-[var(--muted-fg)]">Mode</div>
                  <div className="mt-1 text-sm font-semibold">MCQ Practice</div>
                </div>
                <div className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--soft-bg)] p-4">
                  <div className="text-xs text-[var(--muted-fg)]">Tracking</div>
                  <div className="mt-1 text-sm font-semibold">PrepDNA</div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <form
              onSubmit={onSubmit}
              className="rounded-3xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-6 shadow-[var(--shadow)] md:p-8"
            >
              <div className="flex items-center gap-3">
                <div className="grid size-12 place-items-center rounded-2xl bg-[var(--app-fg)] text-[var(--background)] shadow-sm">
                  PP
                </div>
                <div>
                  <div className="text-sm font-semibold">Welcome back</div>
                  <div className="text-xs text-[var(--muted-fg)]">Login to continue</div>
                </div>
              </div>

              <div className="mt-8 space-y-3">
                <label className="block">
                  <div className="text-xs font-semibold text-[var(--muted-fg)]">Username</div>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder=""
                    className="mt-2 h-11 w-full rounded-xl border border-[color:var(--card-border)] bg-[var(--soft-bg)] px-3 text-sm outline-none focus:border-[var(--accent)] focus:bg-[var(--card-bg)] focus:ring-4 focus:ring-[var(--ring)]"
                  />
                </label>

                <label className="block">
                  <div className="text-xs font-semibold text-[var(--muted-fg)]">Password</div>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder=""
                    className="mt-2 h-11 w-full rounded-xl border border-[color:var(--card-border)] bg-[var(--soft-bg)] px-3 text-sm outline-none focus:border-[var(--accent)] focus:bg-[var(--card-bg)] focus:ring-4 focus:ring-[var(--ring)]"
                  />
                </label>

                {error ? (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                    {error}
                  </div>
                ) : null}

                <button
                  disabled={!canSubmit}
                  className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy ? "Signing in..." : "ENTER APP"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
