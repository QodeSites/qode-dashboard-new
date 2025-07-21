"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        identifier,
        password,
        redirect: false,
      });

      if (result?.error) {
        throw new Error("Invalid email/icode or password");
      }

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-serif font-bold text-logo-green mb-2">Qode</h1>
          <p className="text-card-text-secondary">Welcome back to your dashboard</p>
        </div>

        <Card className="card-shadow bg-white/70 backdrop-blur-sm border-0">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-heading text-card-text">Sign In</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="identifier" className="block text-sm font-medium text-card-text-secondary mb-1">
                  Email or IQode
                </label>
                <Input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Enter your email or IQode"
                  required
                  className="bg-primary-bg border-card-text-secondary/30 text-card-text placeholder:text-card-text-secondary/60"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-card-text-secondary mb-1">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="bg-primary-bg border-card-text-secondary/30 text-card-text placeholder:text-card-text-secondary/60"
                />
              </div>

              {error && <div className="text-red-600 text-sm text-center">{error}</div>}

              <Button
                type="submit"
                className="w-full bg-logo-green text-button-text hover:bg-logo-green/90"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-card-text-secondary">Demo credentials: admin@qode.com or QUS00003 / password</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}