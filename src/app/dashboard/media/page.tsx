import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/access";
import { MediaLibrary } from "@/components/media/media-library";
import "@/components/media/media.css";

export const metadata: Metadata = { title: "Media library" };

export default async function MediaPage() {
  await requireAdmin();
  return <MediaLibrary />;
}
