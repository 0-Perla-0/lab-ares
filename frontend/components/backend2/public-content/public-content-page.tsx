"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { PublicFooter } from "@/components/public/footer";
import { PublicHeader } from "@/components/public/header";
import { LoadError, LoadingTable } from "@/components/ui/primitives";
import { getApiErrorMessage } from "@/lib/api";
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

  async function load() {
    setLoading(true);
    setError("");
    try {
      setPage(
        faqOnly
          ? await publicContentApi.faq()
          : await publicContentApi.publishedPage(slug),
      );
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "load"));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => void load(), [faqOnly, slug]);

  return (
    <>
      <PublicHeader />
      <main className="min-h-[70vh] bg-[#f4f0e7] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-4xl">
          {loading && !page ? (
            <LoadingTable />
          ) : error && !page ? (
            <LoadError message={error} onRetry={() => void load()} />
          ) : page ? (
            <article>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#769a27]">
                Información institucional
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] sm:text-6xl">
                {page.titulo}
              </h1>
              <p className="mt-4 text-sm text-[#66736d]">
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
      <p className="whitespace-pre-line text-base leading-8 text-[#435249]">
        {block.contenido.texto}
      </p>
    );
  if (block.tipo === "ENCABEZADO") {
    const className = "font-black tracking-[-0.035em] text-[#12221b]";
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
        className={`space-y-2 pl-6 leading-7 text-[#435249] ${block.contenido.ordenada ? "list-decimal" : "list-disc"}`}
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
        className="focus-ring inline-flex min-h-11 items-center rounded-xl bg-[#12221b] px-5 text-sm font-black text-white"
      >
        {block.contenido.etiqueta}
      </Link>
    );
  if (block.tipo === "AVISO") {
    const tone =
      block.contenido.tono === "ADVERTENCIA"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : block.contenido.tono === "EXITO"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-sky-200 bg-sky-50 text-sky-900";
    return (
      <aside className={`rounded-2xl border p-5 ${tone}`}>
        {block.contenido.titulo && (
          <h2 className="font-black">{block.contenido.titulo}</h2>
        )}
        <p className="mt-1 whitespace-pre-line text-sm leading-6">
          {block.contenido.texto}
        </p>
      </aside>
    );
  }
  if (block.tipo === "FAQ")
    return (
      <details className="rounded-2xl border border-[#12221b]/10 bg-white p-5">
        <summary className="focus-ring cursor-pointer rounded-lg font-black">
          {block.contenido.pregunta}
        </summary>
        <p className="mt-4 whitespace-pre-line text-sm leading-7 text-[#536159]">
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
    <figure className="overflow-hidden rounded-2xl border border-[#12221b]/10 bg-white p-3">
      {url ? (
        <img
          src={url}
          alt={block.contenido.alt}
          className="h-auto w-full rounded-xl object-cover"
        />
      ) : (
        <div
          role="status"
          className="grid min-h-48 place-items-center text-sm font-bold text-[#66736d]"
        >
          Cargando imagen…
        </div>
      )}
      {block.contenido.pie && (
        <figcaption className="px-2 pb-1 pt-3 text-sm text-[#66736d]">
          {block.contenido.pie}
        </figcaption>
      )}
    </figure>
  );
}
