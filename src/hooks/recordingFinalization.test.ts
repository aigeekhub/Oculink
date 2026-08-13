import { describe, expect, it, vi } from "vitest";
import { persistBeforeCompletion } from "./recordingFinalization";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

describe("persistBeforeCompletion", () => {
	it("does not report completion before persistence and assignment finish", async () => {
		const persistence = deferred<{ path: string }>();
		const assignment = deferred<void>();
		const report = vi.fn(async () => undefined);
		const operation = persistBeforeCompletion({
			persist: () => persistence.promise,
			assign: () => assignment.promise,
			report,
		});

		await Promise.resolve();
		expect(report).not.toHaveBeenCalled();
		persistence.resolve({ path: "recording.webm" });
		await Promise.resolve();
		expect(report).not.toHaveBeenCalled();
		assignment.resolve();

		expect(await operation).toEqual({ success: true, value: { path: "recording.webm" } });
		expect(report).toHaveBeenCalledExactlyOnceWith({ status: "completed" });
	});

	it("reports persistence and assignment failures without reporting completion", async () => {
		const persistenceReport = vi.fn(async () => undefined);
		const persistenceFailure = await persistBeforeCompletion({
			persist: async () => {
				throw new Error("store failed");
			},
			assign: async () => undefined,
			report: persistenceReport,
		});
		expect(persistenceFailure).toMatchObject({ success: false });
		expect(persistenceReport).toHaveBeenCalledExactlyOnceWith({
			status: "failed",
			error: "store failed",
		});

		const assignmentReport = vi.fn(async () => undefined);
		const assignmentFailure = await persistBeforeCompletion({
			persist: async () => ({ path: "recording.webm" }),
			assign: async () => {
				throw new Error("assignment failed");
			},
			report: assignmentReport,
		});
		expect(assignmentFailure).toMatchObject({ success: false });
		expect(assignmentReport).toHaveBeenCalledExactlyOnceWith({
			status: "failed",
			error: "assignment failed",
		});
	});
});
