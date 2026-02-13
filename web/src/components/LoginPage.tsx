import { useState } from "react";
import { api } from "../api.js";

interface LoginPageProps {
  onSuccess: () => void;
}

export function LoginPage({ onSuccess }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.authLogin(username, password);
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = username.trim() && password && !loading;

  return (
    <div className="h-[100dvh] flex items-center justify-center bg-cc-bg text-cc-fg font-sans-ui antialiased">
      <div className="w-full max-w-sm mx-4">
        <div className="bg-cc-card border border-cc-border rounded-xl p-6 sm:p-8">
          <h1 className="text-lg font-semibold mb-1">Sign in</h1>
          <p className="text-sm text-cc-muted mb-6">
            Enter your credentials to access Mission Control.
          </p>

          {error && (
            <div className="mb-4 px-3 py-2 text-sm rounded-lg bg-cc-error/10 border border-cc-error/20 text-cc-error">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Username</label>
              <input
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-cc-input-bg border border-cc-border rounded-lg focus:outline-none focus:border-cc-primary/60"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-cc-input-bg border border-cc-border rounded-lg focus:outline-none focus:border-cc-primary/60"
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className={`w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                canSubmit
                  ? "bg-cc-primary hover:bg-cc-primary-hover text-white"
                  : "bg-cc-hover text-cc-muted cursor-not-allowed"
              }`}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
