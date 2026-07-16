import { redirect } from "next/navigation";

export default function FailedRedirectPage() {
  redirect("/dashboard/subscribers?filter=failed");
}
