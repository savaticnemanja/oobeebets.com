import { redirect } from "next/navigation";

/** The builder moved to Community; old links land there. */
export default function OldBuilderPage() {
  redirect("/community/new");
}
