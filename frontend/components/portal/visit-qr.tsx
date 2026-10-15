"use client";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { actionClass } from "./domain-ui";
export function VisitQr({ code }: { code: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (canvas.current)
      void QRCode.toCanvas(canvas.current, code, {
        width: 220,
        errorCorrectionLevel: "M",
      }).catch(() =>
        setError("No se pudo generar el QR; utiliza el código manual."),
      );
  }, [code]);
  return (
    <>
      <canvas
        ref={canvas}
        role="img"
        aria-label="Código QR privado de la visita"
      />
      {error && <p role="alert">{error}</p>}
      <p className="break-all">Código privado: {code}</p>
      <p>Compartir sólo con el visitante. El QR no autoriza entrada.</p>
    </>
  );
}
export function VisitScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const generation = useRef(0);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  function stop() {
    generation.current++;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setActive(false);
  }
  useEffect(
    () => () => {
      generation.current++;
      if (timer.current) clearInterval(timer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function start() {
    stop();
    setError("");
    const id = generation.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (id !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      setActive(true);
      if (!video.current) {
        stop();
        return;
      }
      video.current.srcObject = media;
      await video.current.play();
      if (id !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      const canvas = document.createElement("canvas"),
        context = canvas.getContext("2d", { willReadFrequently: true });
      timer.current = setInterval(() => {
        const v = video.current;
        if (!v || !context || !v.videoWidth) return;
        canvas.width = Math.min(v.videoWidth, 640);
        canvas.height = Math.round(
          (v.videoHeight * canvas.width) / v.videoWidth,
        );
        context.drawImage(v, 0, 0, canvas.width, canvas.height);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(image.data, image.width, image.height);
        if (result) {
          stop();
          if (/^[a-f0-9]{64}$/.test(result.data)) onCode(result.data);
          else setError("El QR no contiene un código Ares válido.");
        }
      }, 250);
    } catch {
      if (id !== generation.current) return;
      stop();
      setError(
        "Cámara no disponible o permiso denegado. Usa la búsqueda manual.",
      );
    }
  }
  return (
    <section aria-label="Escáner privado">
      <video
        ref={video}
        muted
        playsInline
        hidden={!active}
        aria-label="Vista previa de cámara"
        className="max-w-sm"
      />
      <button
        className={actionClass}
        type="button"
        onClick={() => (active ? stop() : void start())}
      >
        {active ? "Detener cámara" : "Escanear QR con cámara"}
      </button>
      {error && <p role="alert">{error}</p>}
      <p>
        Procesamiento local: no se suben imágenes ni se guardan
        identificaciones.
      </p>
    </section>
  );
}
