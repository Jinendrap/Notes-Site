import { redirect } from "next/navigation";
import { requireApproved } from "@/lib/auth";
import NotesHome from "../components/NotesHome";

// Students see their folders on the home screen. This page is the owner's
// own folder view ("Open my notes" on the owner's home screen).
export default async function NotesPage({ searchParams }) {
  const { supabase, profile } = await requireApproved();

  if (profile.role !== "admin") {
    redirect(searchParams?.s ? `/dashboard?s=${encodeURIComponent(searchParams.s)}` : "/dashboard");
  }

  return (
    <NotesHome
      supabase={supabase}
      searchParams={searchParams}
      basePath="/notes"
      isAdmin
    />
  );
}
