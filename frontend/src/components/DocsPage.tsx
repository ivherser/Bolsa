import Markdown from "react-markdown";

const modules = import.meta.glob<string>("../../../docs/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

interface Doc {
  slug: string;
  title: string;
  body: string;
}

const DOCS: Doc[] = Object.entries(modules)
  .map(([path, body]) => {
    const slug = path.split("/").pop()!.replace(/\.md$/, "");
    const heading = body.split("\n").find((l) => l.startsWith("# "));
    return { slug, title: heading ? heading.slice(2).trim() : slug, body };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));

interface Props {
  slug: string | null;
  onNavigate: (path: string) => void;
}

export default function DocsPage({ slug, onNavigate }: Props) {
  const current = DOCS.find((d) => d.slug === slug) ?? DOCS[0];

  return (
    <div className="app">
      <header>
        <h1>Bolsa — Documentación</h1>
        <nav className="topnav">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate("/");
            }}
          >
            Volver al screener
          </a>
        </nav>
      </header>
      <div className="layout">
        <aside className="sidebar docs-nav">
          {DOCS.map((d) => (
            <a
              key={d.slug}
              href={`/docs/${d.slug}`}
              className={d.slug === current?.slug ? "active" : ""}
              onClick={(e) => {
                e.preventDefault();
                onNavigate(`/docs/${d.slug}`);
              }}
            >
              {d.title}
            </a>
          ))}
        </aside>
        <main className="main markdown">
          {current ? <Markdown skipHtml>{current.body}</Markdown> : <p>Sin documentos.</p>}
        </main>
      </div>
    </div>
  );
}
