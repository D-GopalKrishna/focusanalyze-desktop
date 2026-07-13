"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthLayout } from "@tauri/components/auth/AuthLayout";
import { AuthButton, AuthDivider, AuthField } from "@tauri/components/auth/AuthField";
import { PasswordInput } from "@tauri/components/auth/PasswordInput";
import { useAuth } from "@tauri/components/auth/AuthProvider";

export function RegisterScreen() {
  const { signUp, signInWithGoogle } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      return;
    }

    setIsSubmitting(true);
    try {
      await signUp();
    } catch (error) {
      console.error("Registration failed", error);
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Join FocusAnalyze"
      subtitle="Registration opens in your system browser. Sessions stay active for up to 90 days."
    >
      <form onSubmit={handleSubmit} className="w-full space-y-4">
        <AuthField
          id="username"
          label="Username *"
          value={username}
          onChange={setUsername}
          placeholder="Username"
          autoComplete="username"
        />

        <div>
          <label htmlFor="password" className="text-[12px] text-gray-300 font-medium mb-1 block">
            Password *
          </label>
          <PasswordInput
            id="password"
            name="password"
            value={password}
            onChange={setPassword}
            placeholder="Password"
            autoComplete="new-password"
          />
        </div>

        <div>
          <label
            htmlFor="confirm-password"
            className="text-[12px] text-gray-300 font-medium mb-1 block"
          >
            Confirm password *
          </label>
          <PasswordInput
            id="confirm-password"
            name="confirm-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Confirm password"
            autoComplete="new-password"
          />
        </div>

        <AuthField
          id="email"
          label="Email *"
          value={email}
          onChange={setEmail}
          type="email"
          placeholder="Email"
          autoComplete="email"
        />

        <AuthField
          id="firstName"
          label="First name *"
          value={firstName}
          onChange={setFirstName}
          placeholder="First name"
          autoComplete="given-name"
        />

        <AuthField
          id="lastName"
          label="Last name *"
          value={lastName}
          onChange={setLastName}
          placeholder="Last name"
          autoComplete="family-name"
        />

        <div className="flex justify-between items-center pt-2">
          <Link
            href="/"
            className="text-gray-400 text-[12px] font-semibold hover:text-gray-200 hover:underline"
          >
            « Back to Login
          </Link>
        </div>

        <AuthButton type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Opening browser..." : "Continue in Browser"}
        </AuthButton>
      </form>

      <div className="mt-8 w-full flex flex-col items-center">
        <AuthDivider label="or sign up with" />
        <div className="mt-4 w-full">
          <AuthButton onClick={() => signInWithGoogle()}>
            Sign up with Google
          </AuthButton>
        </div>
        <p className="mt-4 text-center text-[11px] text-gray-500">
          *Social sign up will redirect you to the login page. Please use the
          google login there to sign up.
        </p>
      </div>
    </AuthLayout>
  );
}
