import { useScopedT } from "@/contexts/I18nContext";
import { RecordingOrbSettings } from "./RecordingOrbSettings";

export function AppSettings() {
	const t = useScopedT("settings");

	return (
		<main className="min-h-screen bg-[#09090b] p-8 text-white">
			<header className="mb-8">
				<h1 className="text-2xl font-semibold">{t("appSettings.title")}</h1>
				<p className="mt-1 text-sm text-zinc-400">{t("appSettings.description")}</p>
			</header>
			<div className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
				{t("appSettings.recordingSection")}
			</div>
			<RecordingOrbSettings />
		</main>
	);
}
