"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/dashboard" : "/login");
  }, [loading, user, router]);

  return (
    <div className="grid min-h-screen place-items-center bg-[var(--app-bg)]">
      <div className="rounded-2xl border border-black/10 bg-white px-6 py-5 text-sm text-black/70 shadow-sm">
        Loading...
      </div>
    </div>
  );
}
