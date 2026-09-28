import type { Metadata } from "next";
import { PublicContentPage } from "@/components/backend2/public-content/public-content-page";

export const metadata: Metadata = { title: "Preguntas frecuentes" };

export default function FrequentlyAskedQuestionsRoute() {
  return <PublicContentPage slug="preguntas-frecuentes" faqOnly />;
}
