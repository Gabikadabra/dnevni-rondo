import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/supabase/admin";
import AdminPanel from "@/components/AdminPanel";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <AdminPanel authenticated={false} />;
  const { data } = await adminDb().from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!data) notFound();
  return <AdminPanel authenticated />;
}
