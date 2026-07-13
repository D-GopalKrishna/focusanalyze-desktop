"use client";

export default function SignedInPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black px-6 text-center text-gray-300">
      <h1 className="text-2xl font-semibold text-white">You&apos;re signed in</h1>
      <p className="mt-3 max-w-md text-sm text-gray-400">
        For the full FocusAnalyze dashboard, run{" "}
        <code className="text-gray-200">npm run tauri:dev:fe</code> from{" "}
        <code className="text-gray-200">focusanalyze-desktop</code>.
      </p>
    </div>
  );
}
