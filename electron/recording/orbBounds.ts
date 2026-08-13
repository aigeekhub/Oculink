export interface OrbWorkArea {
	id: string;
	workArea: { x: number; y: number; width: number; height: number };
}

export interface OrbPlacement {
	displayId: string | null;
	horizontalEdge: "left" | "right";
	verticalEdge: "top" | "bottom";
}

export interface OrbBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function supportsOrbContentProtection(platform: NodeJS.Platform): boolean {
	return platform === "darwin" || platform === "win32";
}

export function getOrbBounds(
	displays: readonly OrbWorkArea[],
	placement: OrbPlacement,
	size: number,
	fallbackDisplayId: string | null = null,
	margin = 16,
): OrbBounds | null {
	const display =
		displays.find(({ id }) => id === placement.displayId) ??
		displays.find(({ id }) => id === fallbackDisplayId) ??
		displays[0];
	if (!display) return null;

	const width = Math.min(size, display.workArea.width);
	const height = Math.min(size, display.workArea.height);
	const minX = display.workArea.x;
	const minY = display.workArea.y;
	const maxX = display.workArea.x + display.workArea.width - width;
	const maxY = display.workArea.y + display.workArea.height - height;
	const edgeX = placement.horizontalEdge === "left" ? minX + margin : maxX - margin;
	const edgeY = placement.verticalEdge === "top" ? minY + margin : maxY - margin;

	return {
		x: Math.min(maxX, Math.max(minX, edgeX)),
		y: Math.min(maxY, Math.max(minY, edgeY)),
		width,
		height,
	};
}
