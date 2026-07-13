"use client";

import Image from "next/image";
import { useState } from "react";
import { useAuth } from "@tauri/components/auth/AuthProvider";

export function LoginScreen() {
  const { signIn } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    setIsSubmitting(true);
    try {
      await signIn();
    } catch (error) {
      console.error("Sign in failed", error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black px-6 text-center">
      <Image
        src="/logo.png"
        alt="FocusAnalyze"
        width={72}
        height={72}
        className="mb-8 rounded-2xl"
        priority
      />
      <h1 className="text-3xl font-semibold tracking-tight text-white">FocusAnalyze</h1>
      <p className="mt-3 max-w-sm text-sm text-gray-400">
        Click below to sign in. Your browser will open and bring you back when done.
      </p>
      <button
        type="button"
        onClick={handleLogin}
        disabled={isSubmitting}
        className="mt-10 rounded-full bg-white px-8 py-3 text-sm font-medium text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Opening browser..." : "Click to log in"}
      </button>
    </div>
  );
}
