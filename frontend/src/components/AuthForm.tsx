import { type FormEvent, useState } from "react";
import { supabase } from "../supabase";

type Mode = "login" | "signup";

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "Email o contraseña incorrectos",
  email_not_confirmed: "Confirma tu email antes de iniciar sesión",
  user_already_exists: "Ya existe una cuenta con ese email",
  weak_password: "La contraseña es demasiado débil",
  over_email_send_rate_limit: "Demasiados intentos; espera unos minutos",
  over_request_rate_limit: "Demasiados intentos; espera unos minutos",
  signup_disabled: "El registro está deshabilitado",
};

interface Props {
  onShowDocs: () => void;
}

export default function AuthForm({ onShowDocs }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const creds = { email: email.trim(), password };
    const { data, error: err } =
      mode === "login"
        ? await supabase.auth.signInWithPassword(creds)
        : await supabase.auth.signUp({
            ...creds,
            options: { emailRedirectTo: window.location.origin },
          });
    setBusy(false);
    if (err) {
      setError((err.code && AUTH_MESSAGES[err.code]) || "No se pudo completar la operación");
      return;
    }
    if (mode === "signup" && !data.session) {
      setInfo("Cuenta creada. Revisa tu email para confirmarla y después inicia sesión.");
      setMode("login");
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Bolsa — Screener de opciones</h1>
        <h2>{mode === "login" ? "Iniciar sesión" : "Crear cuenta"}</h2>
        <div className="field">
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="auth-password">Contraseña</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "signup" ? 8 : 1}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <div className="hint">{error}</div>}
        {info && <div className="info">{info}</div>}
        <button type="submit" className="search-btn" disabled={busy}>
          {busy ? "Procesando…" : mode === "login" ? "Entrar" : "Registrarme"}
        </button>
        <div className="auth-switch">
          {mode === "login" ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setError(null);
              setInfo(null);
            }}
          >
            {mode === "login" ? "Regístrate" : "Inicia sesión"}
          </button>
        </div>
        <div className="auth-switch">
          <button type="button" className="link-btn" onClick={onShowDocs}>
            Ver documentación
          </button>
        </div>
      </form>
    </div>
  );
}
