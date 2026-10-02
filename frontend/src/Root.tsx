import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import App from "./App";
import AuthForm from "./components/AuthForm";
import DocsPage from "./components/DocsPage";
import { supabase } from "./supabase";

function usePath(): [string, (to: string) => void] {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) window.history.pushState(null, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  }, []);
  return [path, navigate];
}

function AuthGate({ onNavigate }: { onNavigate: (to: string) => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (!supabase) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Configuración incompleta</h1>
          <p>
            Falta la variable <code>VITE_SUPABASE_ANON_KEY</code>. Defínela en Vercel (Settings →
            Environment Variables) o en <code>frontend/.env.local</code> y vuelve a desplegar.
          </p>
        </div>
      </div>
    );
  }
  if (!ready) return <div className="state-msg">Cargando…</div>;
  if (!session) return <AuthForm onShowDocs={() => onNavigate("/docs")} />;

  const logout = async () => {
    await supabase?.auth.signOut();
  };

  return (
    <App
      key={session.user.id}
      userId={session.user.id}
      userEmail={session.user.email ?? ""}
      onNavigate={onNavigate}
      onLogout={logout}
    />
  );
}

export default function Root() {
  const [path, navigate] = usePath();
  if (path === "/docs" || path.startsWith("/docs/")) {
    const slug = path.slice("/docs/".length) || null;
    return <DocsPage slug={slug} onNavigate={navigate} />;
  }
  return <AuthGate onNavigate={navigate} />;
}
