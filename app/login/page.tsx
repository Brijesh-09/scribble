"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { GoogleButton } from "../components/GoogleButton";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
      } else {
        window.location.assign("/");
      }
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-2xl font-bold">Sign in to Scribble</h1>

      <GoogleButton />
<div className="my-4 flex items-center gap-3 text-[13px] text-[var(--muted)]">
  <span className="h-px flex-1 bg-white/10" />
  or
  <span className="h-px flex-1 bg-white/10" />
</div>

      <form onSubmit={handleLogin} className="space-y-4">
        <label className="block">
          Email
          <input
            className="mt-1 w-full rounded border p-2"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="block">
          Password
          <input
            className="mt-1 w-full rounded border p-2"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button
          className="w-full rounded bg-black p-2 text-white disabled:opacity-50"
          disabled={loading}
          type="submit"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {message && <p role="status" className="mt-4">{message}</p>}

      <p className="mt-4 text-sm">
        New to Scribble? <Link className="underline" href="/signup">Create an account</Link>
      </p>
    </main>
  );
}