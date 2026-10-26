"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { PublicFooter } from "@/components/public/footer";
import { PublicHeader } from "@/components/public/header";
import { LoadError, LoadingTable } from "@/components/ui/primitives";
import { ApiError, getApiErrorMessage } from "@/lib/api";
import {
  publicContentApi,
  type PublicBlock,
  type PublishedPage,
} from "@/lib/backend2/public-content";

export function PublicContentPage({
  slug,
  faqOnly = false,
}: {
  slug: string;
  faqOnly?: boolean;
}) {
  const [page, setPage] = useState<PublishedPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unpublished, setUnpublished] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    setUnpublished(false);
    try {
      setPage(
        faqOnly
          ? await publicContentApi.faq()
          : await publicContentApi.publishedPage(slug),
      );
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status === 404) {
        setPage(null);
        setUnpublished(true);
        return;
      }
      setError(getApiErrorMessage(requestError, "load"));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => void load(), [faqOnly, slug]);

  return (
    <>
      <PublicHeader />
      <main className="min-h-[70vh] bg-[var(--color-surface-inset)] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-4xl">
          {loading && !page ? (
            <LoadingTable />
          ) : unpublished ? (
            <section role="status" className="space-y-4">
              <h1 className="text-3xl font-bold tracking-[-0.04em]">
                Esta información aún no está publicada
              </h1>
              <p className="text-[var(--color-muted)]">
                El contenido institucional se publica desde administración.
                Vuelve más tarde o regresa al inicio.
              </p>
              <Link
                href="/"
                className="focus-ring inline-flex min-h-11 items-center rounded-full bg-[var(--color-primary)] px-5 text-sm font-bold text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)]"
              >
                Volver al inicio
              </Link>
            </section>
          ) : error && !page ? (
            <LoadError message={error} onRetry={() => void load()} />
          ) : page ? (
            <article>
              <p className="text-xs font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[var(--color-accent-text)]">
                Información institucional
              </p>
              <h1 className="mt-3 text-4xl font-bold tracking-[-0.05em] sm:text-6xl">
                {page.titulo}
              </h1>
              <p className="mt-4 text-sm text-[var(--color-muted)]">
                Versión {page.metadata.version} · contenido publicado
              </p>
              <div className="mt-10 space-y-5">
                {page.bloques.map((block) => (
                  <SafeBlock
                    key={block.id ?? `${block.tipo}-${block.orden}`}
                    block={block}
                  />
                ))}
              </div>
            </article>
          ) : null}
        </div>
      </main>
      <PublicFooter />
    </>
  );
}

function SafeBlock({ block }: { block: PublicBlock }) {
  if (block.tipo === "TEXTO")
    return (
      <p className="whitespace-pre-line text-base leading-8 text-[var(--color-muted)]">
        {block.contenido.texto}
      </p>
    );
  if (block.tipo === "ENCABEZADO") {
    const className = "font-bold tracking-[-0.035em] text-[var(--color-ink)]";
    if (block.contenido.nivel <= 2)
      return (
        <h2 className={`${className} pt-4 text-3xl`}>
          {block.contenido.texto}
        </h2>
      );
    if (block.contenido.nivel === 3)
      return (
        <h3 className={`${className} pt-3 text-2xl`}>
          {block.contenido.texto}
        </h3>
      );
    return (
      <h4 className={`${className} pt-2 text-xl`}>{block.contenido.texto}</h4>
    );
  }
  if (block.tipo === "LISTA") {
    const Tag = block.contenido.ordenada ? "ol" : "ul";
    return (
      <Tag
        className={`space-y-2 pl-6 leading-7 text-[var(--color-muted)] ${block.contenido.ordenada ? "list-decimal" : "list-disc"}`}
      >
        {block.contenido.elementos.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </Tag>
    );
  }
  if (block.tipo === "ENLACE")
    return (
      <Link
        href={block.contenido.url}
        target={block.contenido.nuevaVentana ? "_blank" : undefined}
        rel={block.contenido.nuevaVentana ? "noreferrer" : undefined}
        className="focus-ring inline-flex min-h-11 items-center rounded-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] px-5 text-sm font-bold text-[var(--color-on-primary)]"
      >
        {block.contenido.etiqueta}
      </Link>
    );
  if (block.tipo === "AVISO") {
    const tone =
      block.contenido.tono === "ADVERTENCIA"
        ? "border-[var(--color-warning-border)] bg-[var(--color-warning-soft)] text-[var(--color-warning-text)]"
        : block.contenido.tono === "EXITO"
          ? "border-[var(--color-success-border)] bg-[var(--color-success-soft)] text-[var(--color-success-text)]"
          : "border-[var(--color-info-border)] bg-[var(--color-info-soft)] text-[var(--color-info-text)]";
    return (
      <aside className={`rounded-[var(--radius-card)] border p-5 ${tone}`}>
        {block.contenido.titulo && (
          <h2 className="font-bold">{block.contenido.titulo}</h2>
        )}
        <p className="mt-1 whitespace-pre-line text-sm leading-6">
          {block.contenido.texto}
        </p>
      </aside>
    );
  }
  if (block.tipo === "FAQ")
    return (
      <details className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <summary className="focus-ring cursor-pointer rounded-lg font-bold">
          {block.contenido.pregunta}
        </summary>
        <p className="mt-4 whitespace-pre-line text-sm leading-7 text-[var(--color-muted)]">
          {block.contenido.respuesta}
        </p>
      </details>
    );
  if (block.tipo === "IMAGEN" && block.activo)
    return <PublicAssetImage block={block} />;
  return null;
}

function PublicAssetImage({
  block,
}: {
  block: Extract<PublicBlock, { tipo: "IMAGEN" }>;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (block.activo)
      void publicContentApi
        .asset(block.activo.id)
        .then((asset) => setUrl(asset.url ?? ""))
        .catch(() => setUrl(""));
  }, [block.activo]);
  return (
    <figure className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      {url ? (
        <img
          src={url}
          alt={block.contenido.alt}
          className="h-auto w-full rounded-[var(--radius-card)] object-cover"
        />
      ) : (
        <div
          role="status"
          className="grid min-h-48 place-items-center text-sm font-bold text-[var(--color-muted)]"
        >
          Cargando imagen…
        </div>
      )}
      {block.contenido.pie && (
        <figcaption className="px-2 pb-1 pt-3 text-sm text-[var(--color-muted)]">
          {block.contenido.pie}
        </figcaption>
      )}
    </figure>
  );
}
