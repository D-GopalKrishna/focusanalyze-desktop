import Image from "next/image";
import type { ReactNode } from "react";

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#000000] to-[#18181b] px-4 py-10 font-sans">
      <div className="w-full max-w-lg mx-auto p-8 bg-[#18181b] border border-[#232323] rounded-2xl shadow-xl flex flex-col items-center">
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/logo.png"
            alt="FocusAnalyze"
            width={56}
            height={56}
            className="mb-4"
            priority
          />
          <h1 className="text-3xl font-bold text-gray-100 mb-2 text-center">
            {title}
          </h1>
          <p className="text-gray-400 text-center text-base">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
