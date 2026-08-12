import "@testing-library/jest-dom";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordingLifecycleSnapshot } from "../../../electron/recording/recordingLifecycle";
import { RecordingOrb } from "./RecordingOrb";

type LifecycleListener = Parameters<Window["electronAPI"]["onRecordingLifecycleChanged"]>[0];

const activeSnapshot: RecordingLifecycleSnapshot = {
	recordingId: 100,
	ownerWebContentsId: 5,
	phase: "recording",
	paused: false,
	stopRequested: false,
};

let listener: LifecycleListener | null;
let unsubscribe: ReturnType<typeof vi.fn>;

beforeEach(() => {
	listener = null;
	unsubscribe = vi.fn();
	window.electronAPI = {
		...window.electronAPI,
		getRecordingLifecycleSnapshot: vi.fn(async () => activeSnapshot),
		onRecordingLifecycleChanged: vi.fn((callback) => {
			listener = callback;
			return unsubscribe;
		}),
		getOrbSettings: vi.fn(async () => ({
			enabled: true,
			alwaysOnTop: true,
			size: 72,
			transparency: 90,
			pulse: "subtle",
		})),
		onOrbSettingsChanged: vi.fn(() => vi.fn()),
	} as Window["electronAPI"];
});

afterEach(() => cleanup());

describe("RecordingOrb", () => {
	it("renders an accessible static recording indication", async () => {
		render(<RecordingOrb />);

		expect(await screen.findByRole("status", { name: "Recording" })).toBeInTheDocument();
		expect(screen.getByTestId("recording-orb-indicator")).toHaveClass("bg-red-500");
	});

	it("reflects lifecycle failures and cleans up its listener", async () => {
		const view = render(<RecordingOrb />);
		await screen.findByRole("status", { name: "Recording" });

		act(() => {
			listener?.({
				...activeSnapshot,
				phase: "failed",
				error: "persistence failed",
			});
		});

		expect(
			screen.getByRole("status", { name: "Recording failed: persistence failed" }),
		).toBeVisible();
		view.unmount();
		expect(unsubscribe).toHaveBeenCalledOnce();
	});
});
