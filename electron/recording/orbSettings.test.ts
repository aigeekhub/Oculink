import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OrbSettingsStore, parseOrbSettingsPatch } from "./orbSettings";

describe("OrbSettingsStore", () => {
	it("recovers corrupt fields independently", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "orb-settings-"));
		const file = path.join(dir, "orb.json");
		await fs.writeFile(file, JSON.stringify({ enabled: false, alwaysOnTop: "yes" }));
		expect(await new OrbSettingsStore(file).load()).toMatchObject({
			enabled: false,
			alwaysOnTop: true,
			size: 72,
			transparency: 90,
			pulse: "subtle",
			placement: { displayId: null, horizontalEdge: "right", verticalEdge: "bottom" },
		});
	});
	it("persists validated updates", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "orb-settings-"));
		const file = path.join(dir, "orb.json");
		const store = new OrbSettingsStore(file);
		expect(await store.update({ enabled: false, size: 96, pulse: "strong" })).toMatchObject({
			enabled: false,
			size: 96,
			pulse: "strong",
		});
		expect(await store.load()).toMatchObject({ enabled: false, size: 96, pulse: "strong" });
	});

	it("accepts only known boolean patch fields", () => {
		expect(parseOrbSettingsPatch({ enabled: false })).toEqual({ enabled: false });
		expect(parseOrbSettingsPatch({ alwaysOnTop: false })).toEqual({ alwaysOnTop: false });
		expect(parseOrbSettingsPatch({ size: 80, transparency: 70, pulse: "off" })).toEqual({
			size: 80,
			transparency: 70,
			pulse: "off",
		});
		expect(parseOrbSettingsPatch({ enabled: "no" })).toBeNull();
		expect(parseOrbSettingsPatch({ size: 20 })).toBeNull();
		expect(parseOrbSettingsPatch({ transparency: 101 })).toBeNull();
		expect(parseOrbSettingsPatch({ pulse: "wild" })).toBeNull();
		expect(parseOrbSettingsPatch({ unknown: true })).toBeNull();
		expect(
			parseOrbSettingsPatch({
				placement: { displayId: "12", horizontalEdge: "left", verticalEdge: "top" },
			}),
		).toEqual({ placement: { displayId: "12", horizontalEdge: "left", verticalEdge: "top" } });
		expect(parseOrbSettingsPatch({ placement: { displayId: 12 } })).toBeNull();
		expect(parseOrbSettingsPatch([])).toBeNull();
		expect(parseOrbSettingsPatch(null)).toBeNull();
	});

	it("resets all values to defaults", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "orb-settings-"));
		const store = new OrbSettingsStore(path.join(dir, "orb.json"));
		await store.update({ enabled: false, size: 120, transparency: 40, pulse: "strong" });

		expect(await store.reset()).toMatchObject({
			enabled: true,
			size: 72,
			transparency: 90,
			pulse: "subtle",
		});
	});

	it("serializes concurrent patches without losing earlier fields", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "orb-settings-"));
		const store = new OrbSettingsStore(path.join(dir, "orb.json"));
		await Promise.all([store.update({ size: 96 }), store.update({ transparency: 60 })]);
		expect(await store.load()).toMatchObject({ size: 96, transparency: 60 });
	});
});
