"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function SsoInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Single-use code: submit once only (strict mode runs effects twice).
    if (started.current) return;
    started.current = true;

    const code = searchParams.get("code");

    // Remove the code from the address bar before doing anything else.
    window.history.replaceState(null, "", "/sso");

    if (!code) {
      setFailed(true);
      return;
    }

    (async () => {
      try {
        const result = await signIn("qap-sso", { code, redirect: false });
        if (result?.error || !result?.ok) {
          setFailed(true);
          return;
        }
        router.replace("/");
      } catch {
        setFailed(true);
      }
    })();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-primary-bg flex items-center justify-center p-4">
      {failed ? (
        <div className="text-center max-w-sm">
          <p className="text-card-text mb-4">
            We couldn&apos;t sign you in from the Qode Algo Platform. Please sign in here.
          </p>
          <Link href="/" className="text-logo-green underline">
            Go to sign in
          </Link>
        </div>
      ) : (
        <div className="text-logo-green text-xl font-heading">Signing you in...</div>
      )}
    </div>
  );
}

export default function SsoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-primary-bg flex items-center justify-center">
          <div className="text-logo-green text-xl font-heading">Signing you in...</div>
        </div>
      }
    >
      <SsoInner />
    </Suspense>
  );
}
