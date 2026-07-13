"use client";

import { LoginScreen } from "@tauri/components/auth/LoginScreen";
import { useAuth } from "@tauri/components/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const { initialized, authenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (initialized && authenticated) {
      router.replace("/signed-in");
    }
  }, [authenticated, initialized, router]);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-gray-400">
        Loading...
      </div>
    );
  }

  if (authenticated) {
    return null;
  }

  return <LoginScreen />;
}
