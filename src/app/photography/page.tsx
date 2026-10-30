import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/access";
import { PhotographyLibrary } from "@/components/photography/library";

export const metadata: Metadata = { title: "Photography" };
export default async function PhotographyPage() {
  await requireAdmin();
  return <PhotographyLibrary />;
}
