import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrbSettings } from "../../../electron/recording/orbSettings";
import { I18nProvider } from "../../contexts/I18nContext";
import { RecordingOrbSettings } from "./RecordingOrbSettings";

const defaults: OrbSettings = {
	enabled: true,
	alwaysOnTop: true,
	size: 72,
	transparency: 90,
	pulse: "subtle",
	placement: { displayId: null, horizontalEdge: "right", verticalEdge: "bottom" },
};

beforeAll(() => {
	globalThis.ResizeObserver = class ResizeObserver {
		observe() {
			return undefined;
		}
		unobserve() {
			return undefined;
		}
		disconnect() {
			return undefined;
		}
	};
});

beforeEach(() => {
	window.electronAPI = {
		...window.electronAPI,
		getOrbSettings: vi.fn(async () => defaults),
		onOrbSettingsChanged: vi.fn(() => vi.fn()),
		updateOrbSettings: vi.fn(async (patch) => ({
			success: true,
			settings: { ...defaults, ...patch },
		})),
		resetOrbSettings: vi.fn(async () => ({ success: true, settings: defaults })),
	} as Window["electronAPI"];
});

afterEach(cleanup);

describe("RecordingOrbSettings", () => {
	it("loads accessible controls and persists toggles", async () => {
		render(<RecordingOrbSettings />, { wrapper: I18nProvider });
		const enabled = await screen.findByRole("switch", { name: "Enable recording orb" });
		expect(enabled).toBeChecked();

		fireEvent.click(enabled);
		await waitFor(() => {
			expect(window.electronAPI.updateOrbSettings).toHaveBeenCalledWith({ enabled: false });
		});
		expect(screen.getByRole("slider", { name: "Recording orb size" })).toBeVisible();
		expect(screen.getByRole("slider", { name: "Recording orb transparency" })).toBeVisible();
		expect(screen.getByRole("combobox", { name: "Recording orb pulse" })).toBeVisible();
	});

	it("resets settings to defaults", async () => {
		render(<RecordingOrbSettings />, { wrapper: I18nProvider });
		fireEvent.click(await screen.findByRole("button", { name: "Reset to defaults" }));

		await waitFor(() => expect(window.electronAPI.resetOrbSettings).toHaveBeenCalledOnce());
	});

	it("restores authoritative settings when persistence fails", async () => {
		vi.mocked(window.electronAPI.updateOrbSettings).mockResolvedValueOnce({ success: false });
		render(<RecordingOrbSettings />, { wrapper: I18nProvider });
		const enabled = await screen.findByRole("switch", { name: "Enable recording orb" });
		fireEvent.click(enabled);

		await waitFor(() => expect(enabled).toBeChecked());
		expect(window.electronAPI.getOrbSettings).toHaveBeenCalledTimes(2);
	});
});
