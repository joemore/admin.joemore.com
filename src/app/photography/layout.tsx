import { requireAdmin } from "@/lib/auth/access";
import { AdminShell } from "@/components/layout/admin-shell";
import "@/components/media/media.css";
import "@/components/photography/photography.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PhotographyLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return <AdminShell admin={admin}>{children}</AdminShell>;
}
