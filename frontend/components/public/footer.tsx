import Link from "next/link";

import { Brand } from "./brand";

export function PublicFooter() {
  return (
    <footer className="bg-[#12221b] text-white">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10">
        <div className="grid gap-10 border-b border-white/10 pb-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Brand inverse />
            <p className="mt-5 max-w-sm text-sm leading-7 text-white/55">
              El espacio operativo del Laboratorio de Inventores para organizar
              equipos, sedes y horarios con claridad.
            </p>
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#c8f169]">
              Explorar
            </h2>
            <div className="mt-5 grid gap-3 text-sm text-white/65">
              <Link href="/#plataforma" className="hover:text-white">
                Plataforma
              </Link>
              <Link href="/#como-funciona" className="hover:text-white">
                Cómo funciona
              </Link>
              <Link href="/#nosotros" className="hover:text-white">
                Nosotros
              </Link>
            </div>
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-[#c8f169]">
              Acceso
            </h2>
            <p className="mt-5 text-sm leading-7 text-white/55">
              ¿Ya formas parte del equipo?
            </p>
            <Link
              href="/login"
              className="mt-3 inline-flex text-sm font-extrabold text-white hover:text-[#c8f169]"
            >
              Inicia sesión →
            </Link>
          </div>
        </div>
        <p className="pt-7 text-xs text-white/35">
          © {new Date().getFullYear()} Laboratorio de Inventores. Todos los
          derechos reservados.
        </p>
      </div>
    </footer>
  );
}
