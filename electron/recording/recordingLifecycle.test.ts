import { describe, expect, it } from "vitest";
import { RecordingLifecycle } from "./recordingLifecycle";

describe("RecordingLifecycle", () => {
	it("keys ownership and coalesces stop for the active recording", () => {
		const lifecycle = new RecordingLifecycle();
		expect(lifecycle.start(10, 42)).toMatchObject({ recordingId: 10, ownerWebContentsId: 42 });
		expect(lifecycle.requestStop(10)?.phase).toBe("stopping");
		expect(lifecycle.requestStop(10)?.stopRequested).toBe(true);
		expect(lifecycle.requestStop(9)).toBeNull();
	});

	it("rejects stale starts and completions", () => {
		const lifecycle = new RecordingLifecycle();
		lifecycle.start(20, 2);
		expect(lifecycle.start(19, 1)).toBeNull();
		expect(lifecycle.complete(19)).toBeNull();
		expect(lifecycle.complete(20)?.phase).toBe("completed");
	});

	it("does not resurrect a cleared recording from a stale start", () => {
		const lifecycle = new RecordingLifecycle();
		lifecycle.start(25, 3);
		expect(lifecycle.clear(25)).toBe(true);

		expect(lifecycle.start(25, 3)).toBeNull();
		expect(lifecycle.getSnapshot()).toBeNull();
	});

	it("coalesces duplicate stop requests without changing recording identity", () => {
		const lifecycle = new RecordingLifecycle();
		lifecycle.start(30, 7);

		const first = lifecycle.requestStop(30);
		const duplicate = lifecycle.requestStop(30);

		expect(first).toEqual(duplicate);
		expect(duplicate).toMatchObject({
			recordingId: 30,
			ownerWebContentsId: 7,
			phase: "stopping",
			stopRequested: true,
		});
	});

	it("broadcasts changed transitions only", () => {
		const lifecycle = new RecordingLifecycle();
		const snapshots: Array<{ phase: string; paused: boolean }> = [];
		const unsubscribe = lifecycle.subscribe((snapshot) => {
			if (snapshot) snapshots.push({ phase: snapshot.phase, paused: snapshot.paused });
		});

		lifecycle.start(40, 8);
		lifecycle.start(40, 8);
		lifecycle.setPaused(40, true);
		lifecycle.setPaused(40, true);
		lifecycle.requestStop(40);
		lifecycle.requestStop(40);
		unsubscribe();
		lifecycle.complete(40);

		expect(snapshots).toEqual([
			{ phase: "recording", paused: false },
			{ phase: "recording", paused: true },
			{ phase: "stopping", paused: true },
		]);
	});

	it("rejects invalid identities and same-recording owner replacement", () => {
		const lifecycle = new RecordingLifecycle();
		expect(() => lifecycle.start(0, 1)).toThrow("Invalid recording lifecycle identity");
		expect(() => lifecycle.start(1, 0)).toThrow("Invalid recording lifecycle identity");

		lifecycle.start(50, 9);
		expect(lifecycle.start(50, 10)).toMatchObject({
			recordingId: 50,
			ownerWebContentsId: 9,
		});
	});

	it("returns defensive snapshots and retains failure diagnostics", () => {
		const lifecycle = new RecordingLifecycle();
		const started = lifecycle.start(60, 11);
		started.phase = "completed";

		expect(lifecycle.getSnapshot()?.phase).toBe("recording");
		expect(lifecycle.fail(60, "persistence failed")).toMatchObject({
			phase: "failed",
			error: "persistence failed",
		});
		expect(lifecycle.complete(60)).toMatchObject({
			phase: "failed",
			error: "persistence failed",
		});
	});
});
