import { redirect } from "next/navigation";
import { isIntelligenceDashboard } from "@/lib/dashboard-product";

export default function Home() {
	if (isIntelligenceDashboard()) {
		redirect("/insights");
	}

	redirect("/home");
}
