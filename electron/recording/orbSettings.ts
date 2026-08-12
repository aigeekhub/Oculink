import fs from "node:fs/promises";
import path from "node:path";
import type { OrbPlacement } from "./orbBounds";

export interface OrbSettings {
	enabled: boolean;
	alwaysOnTop: boolean;
	size: number;
	transparency: number;
	pulse: "off" | "subtle" | "strong";
	placement: OrbPlacement;
}
export const DEFAULT_ORB_SETTINGS: OrbSettings = {
	enabled: true,
	alwaysOnTop: true,
	size: 72,
	transparency: 90,
	pulse: "subtle",
	placement: { displayId: null, horizontalEdge: "right", verticalEdge: "bottom" },
};
const ORB_SETTING_KEYS = new Set<keyof OrbSettings>([
	"enabled",
	"alwaysOnTop",
	"size",
	"transparency",
	"pulse",
	"placement",
]);
const PULSE_VALUES = new Set<OrbSettings["pulse"]>(["off", "subtle", "strong"]);

function normalizePlacement(value: unknown): OrbPlacement {
	const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
	return {
		displayId:
			typeof record.displayId === "string" || record.displayId === null
				? record.displayId
				: DEFAULT_ORB_SETTINGS.placement.displayId,
		horizontalEdge:
			record.horizontalEdge === "left" || record.horizontalEdge === "right"
				? record.horizontalEdge
				: DEFAULT_ORB_SETTINGS.placement.horizontalEdge,
		verticalEdge:
			record.verticalEdge === "top" || record.verticalEdge === "bottom"
				? record.verticalEdge
				: DEFAULT_ORB_SETTINGS.placement.verticalEdge,
	};
}

export function parseOrbSettingsPatch(value: unknown): Partial<OrbSettings> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) return null;

	const record = value as Record<string, unknown>;
	const keys = Object.keys(record);
	if (keys.some((key) => !ORB_SETTING_KEYS.has(key as keyof OrbSettings))) return null;
	if ("enabled" in record && typeof record.enabled !== "boolean") return null;
	if ("alwaysOnTop" in record && typeof record.alwaysOnTop !== "boolean") return null;
	if (
		"size" in record &&
		(typeof record.size !== "number" ||
			!Number.isFinite(record.size) ||
			record.size < 48 ||
			record.size > 128)
	)
		return null;
	if (
		"transparency" in record &&
		(typeof record.transparency !== "number" ||
			!Number.isFinite(record.transparency) ||
			record.transparency < 30 ||
			record.transparency > 100)
	)
		return null;
	if ("pulse" in record && !PULSE_VALUES.has(record.pulse as OrbSettings["pulse"])) return null;
	if ("placement" in record) {
		const placement = record.placement;
		if (!placement || typeof placement !== "object" || Array.isArray(placement)) return null;
		const placementRecord = placement as Record<string, unknown>;
		if (
			Object.keys(placementRecord).some(
				(key) => !["displayId", "horizontalEdge", "verticalEdge"].includes(key),
			) ||
			!(typeof placementRecord.displayId === "string" || placementRecord.displayId === null) ||
			!(placementRecord.horizontalEdge === "left" || placementRecord.horizontalEdge === "right") ||
			!(placementRecord.verticalEdge === "top" || placementRecord.verticalEdge === "bottom")
		)
			return null;
	}

	const patch: Partial<OrbSettings> = {};
	if ("enabled" in record) patch.enabled = record.enabled as boolean;
	if ("alwaysOnTop" in record) patch.alwaysOnTop = record.alwaysOnTop as boolean;
	if ("size" in record) patch.size = Math.round(record.size as number);
	if ("transparency" in record) patch.transparency = Math.round(record.transparency as number);
	if ("pulse" in record) patch.pulse = record.pulse as OrbSettings["pulse"];
	if ("placement" in record) patch.placement = normalizePlacement(record.placement);
	return patch;
}

function normalize(value: unknown): OrbSettings {
	const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
	return {
		enabled: typeof record.enabled === "boolean" ? record.enabled : DEFAULT_ORB_SETTINGS.enabled,
		alwaysOnTop:
			typeof record.alwaysOnTop === "boolean"
				? record.alwaysOnTop
				: DEFAULT_ORB_SETTINGS.alwaysOnTop,
		size:
			typeof record.size === "number" &&
			Number.isFinite(record.size) &&
			record.size >= 48 &&
			record.size <= 128
				? Math.round(record.size)
				: DEFAULT_ORB_SETTINGS.size,
		transparency:
			typeof record.transparency === "number" &&
			Number.isFinite(record.transparency) &&
			record.transparency >= 30 &&
			record.transparency <= 100
				? Math.round(record.transparency)
				: DEFAULT_ORB_SETTINGS.transparency,
		pulse: PULSE_VALUES.has(record.pulse as OrbSettings["pulse"])
			? (record.pulse as OrbSettings["pulse"])
			: DEFAULT_ORB_SETTINGS.pulse,
		placement: normalizePlacement(record.placement),
	};
}

export class OrbSettingsStore {
	private mutationQueue: Promise<void> = Promise.resolve();

	constructor(private readonly filePath: string) {}
	async load(): Promise<OrbSettings> {
		try {
			return normalize(JSON.parse(await fs.readFile(this.filePath, "utf8")));
		} catch {
			return { ...DEFAULT_ORB_SETTINGS };
		}
	}
	update(patch: Partial<OrbSettings>): Promise<OrbSettings> {
		const operation = this.mutationQueue.then(async () => {
			const current = await this.load();
			const next = normalize({ ...current, ...patch });
			await fs.mkdir(path.dirname(this.filePath), { recursive: true });
			const temporaryPath = `${this.filePath}.tmp`;
			await fs.writeFile(temporaryPath, JSON.stringify(next, null, 2), "utf8");
			await fs.rename(temporaryPath, this.filePath);
			return next;
		});
		this.mutationQueue = operation.then(
			() => undefined,
			() => undefined,
		);
		return operation;
	}
	async reset(): Promise<OrbSettings> {
		return this.update({ ...DEFAULT_ORB_SETTINGS });
	}
}
