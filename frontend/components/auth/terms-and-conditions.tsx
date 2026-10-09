"use client";

import { useState } from "react";

import { Modal } from "@/components/ui/primitives";

const terms = [
  {
    title: "1. Objeto y aceptación",
    content:
      "Ares es una plataforma de uso interno destinada a apoyar actividades académicas, administrativas, operativas y de servicio social. Al seleccionar “Ingresar” y utilizar el portal, confirmas que leíste estos términos y aceptas cumplirlos, junto con las políticas institucionales y la legislación aplicable. Si no estás de acuerdo, no debes acceder ni utilizar la plataforma.",
  },
  {
    title: "2. Acceso y cuentas",
    content:
      "El acceso es administrado por tu organización. Si no tienes cuenta, solicita el alta a tu responsable. La cuenta es personal e intransferible. Debes proporcionar información veraz, mantener tus credenciales confidenciales, cerrar la sesión en equipos compartidos y reportar de inmediato cualquier pérdida, divulgación o uso no autorizado de tu cuenta.",
  },
  {
    title: "3. Uso autorizado",
    content:
      "Solo puedes utilizar Ares para las funciones permitidas por tu rol y dentro del alcance asignado por la organización. Queda prohibido compartir credenciales, intentar eludir permisos, acceder a información ajena sin autorización, alterar registros indebidamente, extraer datos de forma masiva, introducir código malicioso, interferir con el servicio o emplearlo para fines ilícitos, fraudulentos o contrarios a las políticas institucionales.",
  },
  {
    title: "4. Datos personales y privacidad",
    content:
      "Ares puede tratar datos de identificación, contacto institucional, perfil, adscripción, asistencia, documentos, proyectos, actividad y seguridad para autenticar usuarios, prestar las funciones del portal, cumplir obligaciones institucionales, proteger la plataforma y conservar evidencia de operación. El responsable, las finalidades detalladas, las transferencias aplicables y los medios para ejercer derechos de acceso, rectificación, cancelación u oposición deben consultarse en el aviso de privacidad institucional. No debes cargar datos personales o sensibles que no sean necesarios para una función autorizada.",
  },
  {
    title: "5. Seguridad y registros",
    content:
      "La organización puede registrar accesos, intentos de autenticación, operaciones, cambios y datos técnicos razonablemente necesarios para seguridad, auditoría, soporte, prevención de abuso, atención de incidentes y cumplimiento normativo. Estos controles deberán aplicarse de forma proporcional y conforme al aviso de privacidad y a la normativa correspondiente.",
  },
  {
    title: "6. Contenido y propiedad intelectual",
    content:
      "El software, diseño, marcas, documentación y contenidos institucionales disponibles en Ares pertenecen a sus respectivos titulares. El acceso concede únicamente una autorización limitada, revocable y no transferible para usar el portal en actividades institucionales autorizadas. No se permite copiar, publicar, modificar, distribuir o explotar contenidos fuera de ese propósito sin autorización.",
  },
  {
    title: "7. Disponibilidad y conservación",
    content:
      "La plataforma puede suspenderse temporalmente por mantenimiento, seguridad, fallas técnicas o causas fuera del control razonable de la organización. Los registros se conservarán durante los plazos definidos por las políticas institucionales y la legislación aplicable. Nada en estos términos excluye derechos o responsabilidades que legalmente no puedan limitarse.",
  },
  {
    title: "8. Suspensión o cancelación",
    content:
      "La organización puede restringir, suspender o cancelar el acceso cuando termine la relación que lo justifica, exista un riesgo de seguridad, se detecte uso indebido o lo requiera una obligación institucional o legal. La suspensión de una cuenta no implica la eliminación inmediata de registros que deban conservarse para auditoría, seguridad, responsabilidades o cumplimiento normativo.",
  },
  {
    title: "9. Responsabilidad de la persona usuaria",
    content:
      "Eres responsable de utilizar la cuenta con diligencia y de verificar la exactitud de la información que registres. Debes informar oportunamente errores, accesos no autorizados o incidentes. La organización aplicará medidas razonables de seguridad y operación, sin que estos términos eliminen las responsabilidades que correspondan a cada parte conforme a la ley.",
  },
  {
    title: "10. Modificaciones y legislación aplicable",
    content:
      "Estos términos pueden actualizarse para reflejar cambios funcionales, institucionales o normativos. Cuando el cambio sea relevante, deberá informarse por un medio adecuado antes de que resulte aplicable. El uso de Ares se rige por las políticas de la organización responsable y por la legislación mexicana aplicable, sin limitar los derechos irrenunciables de las personas usuarias.",
  },
];

export function TermsAndConditions() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <p className="mt-8 text-center text-xs leading-5 text-[#667085]">
        Al ingresar aceptas los{" "}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="focus-ring rounded font-extrabold text-[#ea580c] underline decoration-[#f97316]/45 underline-offset-4 hover:text-[#c2410c]"
        >
          Términos y condiciones
        </button>
        .
      </p>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Términos y condiciones de uso"
        description="Última actualización: 6 de octubre de 2026"
      >
        <article className="space-y-6 text-sm leading-7 text-[#475467]">
          <div className="rounded-2xl border border-[#fed7aa] bg-[#fff1e8] p-4 text-[#7c2d12]">
            Estos términos regulan el uso del portal Ares. La organización
            responsable debe complementarlos con su identidad legal, datos de
            contacto, aviso de privacidad y políticas institucionales
            aplicables.
          </div>

          {terms.map((term) => (
            <section key={term.title}>
              <h3 className="font-black text-[#17174a]">{term.title}</h3>
              <p className="mt-1">{term.content}</p>
            </section>
          ))}

          <section>
            <h3 className="font-black text-[#17174a]">11. Contacto</h3>
            <p className="mt-1">
              Para solicitar ayuda, reportar un incidente, aclarar estos
              términos o ejercer derechos relacionados con tus datos, utiliza
              los canales oficiales de la organización o contacta a tu
              responsable institucional.
            </p>
          </section>

          <div className="flex justify-end border-t border-[#dde1ea] pt-5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="focus-ring min-h-11 rounded-xl bg-[#f97316] px-5 text-sm font-black text-[#17174a] hover:bg-[#ea580c]"
            >
              Entendido
            </button>
          </div>
        </article>
      </Modal>
    </>
  );
}
