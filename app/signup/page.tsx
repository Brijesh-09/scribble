"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const supabase = createClient();

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=/`,
        },
      });

      if (error) {
        setMessage(error.message);
      } else if (data.session) {
        window.location.assign("/");
      } else {
        setMessage("Check your email for a confirmation link.");
      }
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-2xl font-bold">Create your Scribble account</h1>

      <form onSubmit={handleSignup} className="space-y-4">
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
            autoComplete="new-password"
            minLength={8}
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
          {loading ? "Creating account..." : "Sign up"}
        </button>
      </form>

      {message && <p role="status" className="mt-4">{message}</p>}

      <p className="mt-4 text-sm">
        Already registered? <Link className="underline" href="/login">Sign in</Link>
      </p>
    </main>
  );
}