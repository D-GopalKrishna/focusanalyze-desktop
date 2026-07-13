"use client";

import { RegisterScreen } from "@tauri/components/auth/RegisterScreen";
import { useAuth } from "@tauri/components/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function RegisterPage() {
  const { initialized, authenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (initialized && authenticated) {
      router.replace("/");
    }
  }, [authenticated, initialized, router]);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#000000] text-gray-300">
        Loading...
      </div>
    );
  }

  if (authenticated) {
    return null;
  }

  return <RegisterScreen />;
}
