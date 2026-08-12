import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useScopedT } from "@/contexts/I18nContext";
import type { OrbSettings } from "../../../electron/recording/orbSettings";

type SettingRowProps = {
	label: string;
	description: string;
	children: ReactNode;
};

function SettingRow({ label, description, children }: SettingRowProps) {
	return (
		<div className="flex items-center justify-between gap-6 border-b border-white/10 py-5 last:border-0">
			<div>
				<div className="font-medium text-white">{label}</div>
				<div className="mt-1 text-sm text-zinc-400">{description}</div>
			</div>
			<div className="min-w-32">{children}</div>
		</div>
	);
}

export function RecordingOrbSettings() {
	const t = useScopedT("settings");
	const [settings, setSettings] = useState<OrbSettings | null>(null);
	const [pendingSaves, setPendingSaves] = useState(0);
	const latestMutation = useRef(0);

	useEffect(() => {
		let disposed = false;
		const unsubscribe = window.electronAPI.onOrbSettingsChanged((next) => {
			if (!disposed) setSettings(next);
		});
		void window.electronAPI.getOrbSettings().then((next) => {
			if (!disposed) setSettings(next);
		});
		return () => {
			disposed = true;
			unsubscribe();
		};
	}, []);

	async function update(patch: Partial<OrbSettings>) {
		if (!settings) return;
		const mutation = ++latestMutation.current;
		setSettings({ ...settings, ...patch });
		setPendingSaves((count) => count + 1);
		try {
			const result = await window.electronAPI.updateOrbSettings(patch);
			if (mutation !== latestMutation.current) return;
			if (result.settings) {
				setSettings(result.settings);
			} else {
				setSettings(await window.electronAPI.getOrbSettings());
			}
		} catch {
			if (mutation === latestMutation.current) {
				setSettings(await window.electronAPI.getOrbSettings());
			}
		} finally {
			setPendingSaves((count) => count - 1);
		}
	}

	async function reset() {
		const mutation = ++latestMutation.current;
		setPendingSaves((count) => count + 1);
		try {
			const result = await window.electronAPI.resetOrbSettings();
			if (mutation !== latestMutation.current) return;
			if (result.settings) {
				setSettings(result.settings);
			} else {
				setSettings(await window.electronAPI.getOrbSettings());
			}
		} catch {
			if (mutation === latestMutation.current) {
				setSettings(await window.electronAPI.getOrbSettings());
			}
		} finally {
			setPendingSaves((count) => count - 1);
		}
	}

	if (!settings) return <div className="p-8 text-zinc-400">{t("recordingOrb.loading")}</div>;

	return (
		<section
			aria-labelledby="recording-orb-heading"
			className="rounded-xl border border-white/10 bg-white/[0.03] p-6"
		>
			<div className="mb-3">
				<h2 id="recording-orb-heading" className="text-xl font-semibold text-white">
					{t("recordingOrb.title")}
				</h2>
				<p className="mt-1 text-sm text-zinc-400">{t("recordingOrb.description")}</p>
			</div>
			<SettingRow
				label={t("recordingOrb.enabled")}
				description={t("recordingOrb.enabledDescription")}
			>
				<Switch
					aria-label={t("recordingOrb.enabledAria")}
					checked={settings.enabled}
					onCheckedChange={(enabled) => void update({ enabled })}
				/>
			</SettingRow>
			<SettingRow
				label={t("recordingOrb.size")}
				description={t("recordingOrb.sizeDescription", { size: settings.size })}
			>
				<Slider
					aria-label={t("recordingOrb.sizeAria")}
					min={48}
					max={128}
					step={4}
					value={[settings.size]}
					onValueCommit={([size]) => size !== undefined && void update({ size })}
				/>
			</SettingRow>
			<SettingRow
				label={t("recordingOrb.transparency")}
				description={t("recordingOrb.transparencyDescription", {
					transparency: settings.transparency,
				})}
			>
				<Slider
					aria-label={t("recordingOrb.transparencyAria")}
					min={30}
					max={100}
					step={5}
					value={[settings.transparency]}
					onValueCommit={([transparency]) =>
						transparency !== undefined && void update({ transparency })
					}
				/>
			</SettingRow>
			<SettingRow label={t("recordingOrb.pulse")} description={t("recordingOrb.pulseDescription")}>
				<select
					aria-label={t("recordingOrb.pulseAria")}
					value={settings.pulse}
					onChange={(event) => void update({ pulse: event.target.value as OrbSettings["pulse"] })}
					className="h-9 w-full rounded-md border border-white/10 bg-zinc-900 px-3 text-sm text-white"
				>
					<option value="off">{t("recordingOrb.pulseOff")}</option>
					<option value="subtle">{t("recordingOrb.pulseSubtle")}</option>
					<option value="strong">{t("recordingOrb.pulseStrong")}</option>
				</select>
			</SettingRow>
			<SettingRow
				label={t("recordingOrb.alwaysOnTop")}
				description={t("recordingOrb.alwaysOnTopDescription")}
			>
				<Switch
					aria-label={t("recordingOrb.alwaysOnTopAria")}
					checked={settings.alwaysOnTop}
					onCheckedChange={(alwaysOnTop) => void update({ alwaysOnTop })}
				/>
			</SettingRow>
			<div className="mt-5 flex items-center justify-between">
				<span aria-live="polite" className="text-xs text-zinc-500">
					{pendingSaves > 0 ? t("recordingOrb.saving") : t("recordingOrb.autoSave")}
				</span>
				<Button type="button" variant="outline" onClick={() => void reset()}>
					{t("recordingOrb.reset")}
				</Button>
			</div>
		</section>
	);
}
