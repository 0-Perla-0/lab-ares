import { AccessForm } from "@/components/auth/access-form";
export const metadata = {
  title: "Recuperar acceso | Ares",
  referrer: "no-referrer",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <AccessForm token={token} />;
}
