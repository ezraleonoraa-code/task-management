
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, register } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = isRegister
        ? await register(username, password)
        : await login(username, password);

      if (result.error) {
        setError(result.error.message);
      } else if (isRegister && !result.data.session) {
        setError("Akun dibuat, tetapi belum mendapat sesi login. Periksa pengaturan konfirmasi akun Supabase.");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    }

    setLoading(false);
  }

  return (
    <main style={{
      minHeight: "100vh",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      background: "#eff6ff",
      padding: 20,
      fontFamily: "Arial, sans-serif"
    }}>
      <form onSubmit={handleSubmit} style={{
        width: "100%",
        maxWidth: 400,
        background: "white",
        padding: 30,
        borderRadius: 16,
        boxShadow: "0 8px 30px rgba(0,0,0,0.08)"
      }}>
        <h1 style={{ color: "#2563eb", textAlign: "center" }}>
          TaskFlow
        </h1>

        <h2 style={{ textAlign: "center" }}>
          {isRegister ? "Create Account" : "Welcome Back"}
        </h2>

        <p style={{ textAlign: "center", color: "#64748b" }}>
          {isRegister ? "Daftar akun TaskFlow baru" : "Login ke akun TaskFlow"}
        </p>

        <label>Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Masukkan username"
          required
          style={{
            width: "100%",
            padding: 12,
            margin: "8px 0 18px",
            boxSizing: "border-box",
            border: "1px solid #cbd5e1",
            borderRadius: 8
          }}
        />

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Masukkan password"
          minLength={6}
          required
          style={{
            width: "100%",
            padding: 12,
            margin: "8px 0 18px",
            boxSizing: "border-box",
            border: "1px solid #cbd5e1",
            borderRadius: 8
          }}
        />

        {error && (
          <p style={{ color: "red", fontSize: 14 }}>{error}</p>
        )}

        <button type="submit" disabled={loading} style={{
          width: "100%",
          padding: 13,
          background: "#2563eb",
          color: "white",
          border: "none",
          borderRadius: 8,
          cursor: "pointer"
        }}>
          {loading ? "Please wait..." : isRegister ? "Sign Up" : "Login"}
        </button>

        <p style={{ textAlign: "center", marginTop: 20 }}>
          {isRegister ? "Sudah punya akun?" : "Belum punya akun?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
            }}
            style={{
              border: "none",
              background: "none",
              color: "#2563eb",
              cursor: "pointer"
            }}
          >
            {isRegister ? "Login" : "Sign Up"}
          </button>
        </p>
      </form>
    </main>
  );
}
