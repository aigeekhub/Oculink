import { describe, expect, it } from "vitest";
import { getOrbBounds, supportsOrbContentProtection } from "./orbBounds";

const displays = [
	{ id: "left", workArea: { x: -1920, y: -120, width: 1920, height: 1080 } },
	{ id: "primary", workArea: { x: 0, y: 0, width: 1440, height: 900 } },
];

describe("getOrbBounds", () => {
	it("places the full orb inside a negative-origin display", () => {
		expect(
			getOrbBounds(
				displays,
				{ displayId: "left", horizontalEdge: "right", verticalEdge: "bottom" },
				72,
			),
		).toEqual({ x: -88, y: 872, width: 72, height: 72 });
	});

	it("falls back to the current display when a persisted display is gone", () => {
		expect(
			getOrbBounds(
				displays,
				{ displayId: "missing", horizontalEdge: "left", verticalEdge: "top" },
				96,
				"primary",
			),
		).toEqual({ x: 16, y: 16, width: 96, height: 96 });
	});

	it("clamps oversized bounds to the complete work area", () => {
		expect(
			getOrbBounds(
				[{ id: "small", workArea: { x: 20, y: 30, width: 60, height: 50 } }],
				{ displayId: "small", horizontalEdge: "right", verticalEdge: "bottom" },
				128,
			),
		).toEqual({ x: 20, y: 30, width: 60, height: 50 });
	});

	it("returns null when no displays are available", () => {
		expect(
			getOrbBounds([], { displayId: null, horizontalEdge: "right", verticalEdge: "bottom" }, 72),
		).toBeNull();
	});
});

describe("supportsOrbContentProtection", () => {
	it("only enables the best-effort protection on supported desktop platforms", () => {
		expect(supportsOrbContentProtection("win32")).toBe(true);
		expect(supportsOrbContentProtection("darwin")).toBe(true);
		expect(supportsOrbContentProtection("linux")).toBe(false);
	});
});
