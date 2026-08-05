import { redirect } from "next/navigation";

// The Clinic Admin has no separate "Inicio" screen — Agenda is the
// application's entry point (see CLAUDE.md Domain Model).
export default function Home() {
  redirect("/agenda");
}
