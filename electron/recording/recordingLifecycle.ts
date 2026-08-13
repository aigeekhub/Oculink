export type RecordingPhase = "recording" | "stopping" | "completed" | "failed";

export interface RecordingLifecycleSnapshot {
	recordingId: number;
	ownerWebContentsId: number;
	phase: RecordingPhase;
	paused: boolean;
	stopRequested: boolean;
	error?: string;
}

export type RecordingLifecycleListener = (snapshot: RecordingLifecycleSnapshot | null) => void;

export class RecordingLifecycle {
	private current: RecordingLifecycleSnapshot | null = null;
	private latestRecordingId = 0;
	private readonly listeners = new Set<RecordingLifecycleListener>();

	getSnapshot(): RecordingLifecycleSnapshot | null {
		return this.current ? { ...this.current } : null;
	}

	subscribe(listener: RecordingLifecycleListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	start(recordingId: number, ownerWebContentsId: number): RecordingLifecycleSnapshot | null {
		if (
			!Number.isSafeInteger(recordingId) ||
			recordingId <= 0 ||
			!Number.isSafeInteger(ownerWebContentsId) ||
			ownerWebContentsId <= 0
		) {
			throw new Error("Invalid recording lifecycle identity");
		}
		if (this.current?.recordingId === recordingId) return this.getSnapshot();
		if (recordingId <= this.latestRecordingId) return null;
		this.latestRecordingId = recordingId;
		this.current = {
			recordingId,
			ownerWebContentsId,
			phase: "recording",
			paused: false,
			stopRequested: false,
		};
		this.emit();
		return this.getSnapshot();
	}

	setPaused(recordingId: number, paused: boolean): RecordingLifecycleSnapshot | null {
		if (!this.current || this.current.recordingId !== recordingId) return null;
		if (this.current.phase !== "recording" || this.current.paused === paused) {
			return this.getSnapshot();
		}
		this.current = { ...this.current, paused };
		this.emit();
		return this.getSnapshot();
	}

	requestStop(recordingId: number): RecordingLifecycleSnapshot | null {
		if (!this.current || this.current.recordingId !== recordingId) return null;
		if (this.current.phase !== "recording" || this.current.stopRequested) return this.getSnapshot();
		this.current = { ...this.current, phase: "stopping", stopRequested: true };
		this.emit();
		return this.getSnapshot();
	}

	complete(recordingId: number): RecordingLifecycleSnapshot | null {
		if (!this.current || this.current.recordingId !== recordingId) return null;
		if (this.current.phase === "completed" || this.current.phase === "failed") {
			return this.getSnapshot();
		}
		this.current = { ...this.current, phase: "completed", stopRequested: true };
		this.emit();
		return this.getSnapshot();
	}

	fail(recordingId: number, error: string): RecordingLifecycleSnapshot | null {
		if (!this.current || this.current.recordingId !== recordingId) return null;
		if (
			this.current.phase === "completed" ||
			(this.current.phase === "failed" && this.current.error === error)
		) {
			return this.getSnapshot();
		}
		this.current = { ...this.current, phase: "failed", stopRequested: true, error };
		this.emit();
		return this.getSnapshot();
	}

	clear(recordingId: number): boolean {
		if (!this.current || this.current.recordingId !== recordingId) return false;
		this.current = null;
		this.emit();
		return true;
	}

	private emit(): void {
		for (const listener of this.listeners) {
			listener(this.getSnapshot());
		}
	}
}
