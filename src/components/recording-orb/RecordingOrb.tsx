import { useEffect, useState } from "react";
import type { OrbSettings } from "../../../electron/recording/orbSettings";
import type { RecordingLifecycleSnapshot } from "../../../electron/recording/recordingLifecycle";

function getAccessibleLabel(snapshot: RecordingLifecycleSnapshot): string {
	if (snapshot.phase === "failed") {
		return `Recording failed${snapshot.error ? `: ${snapshot.error}` : ""}`;
	}
	if (snapshot.phase === "completed") return "Recording complete";
	if (snapshot.phase === "stopping") return "Stopping recording";
	if (snapshot.paused) return "Recording paused";
	return "Recording";
}

export function RecordingOrb() {
	const [snapshot, setSnapshot] = useState<RecordingLifecycleSnapshot | null>(null);
	const [settings, setSettings] = useState<OrbSettings | null>(null);

	useEffect(() => {
		let disposed = false;
		let receivedChange = false;
		const unsubscribe = window.electronAPI.onRecordingLifecycleChanged((nextSnapshot) => {
			receivedChange = true;
			if (!disposed) setSnapshot(nextSnapshot);
		});

		void window.electronAPI.getRecordingLifecycleSnapshot().then((initialSnapshot) => {
			if (!disposed && !receivedChange) setSnapshot(initialSnapshot);
		});

		return () => {
			disposed = true;
			unsubscribe();
		};
	}, []);

	useEffect(() => {
		let disposed = false;
		const unsubscribe = window.electronAPI.onOrbSettingsChanged((nextSettings) => {
			if (!disposed) setSettings(nextSettings);
		});
		void window.electronAPI.getOrbSettings().then((initialSettings) => {
			if (!disposed) setSettings(initialSettings);
		});
		return () => {
			disposed = true;
			unsubscribe();
		};
	}, []);

	if (!snapshot) return null;

	const label = getAccessibleLabel(snapshot);
	const pulseClass =
		settings?.pulse === "strong"
			? "animate-ping motion-reduce:animate-none"
			: settings?.pulse === "subtle"
				? "animate-pulse motion-reduce:animate-none"
				: "";
	return (
		<div className="flex h-screen w-screen items-center justify-center bg-transparent select-none">
			<div
				role="status"
				aria-label={label}
				title={label}
				className="flex h-[78%] w-[78%] items-center justify-center rounded-full border border-white/20 bg-black/80 shadow-2xl"
			>
				<span
					data-testid="recording-orb-indicator"
					className={`h-1/2 w-1/2 rounded-full bg-red-500 shadow-[0_0_18px_rgba(239,68,68,0.8)] ${pulseClass}`}
				/>
			</div>
		</div>
	);
}
