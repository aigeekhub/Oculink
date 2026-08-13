import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("live Windows recording shows, updates, and stops through the orb", async () => {
	test.skip(process.platform !== "win32", "Windows-only smoke test");
	test.setTimeout(120_000);
	const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-orb-smoke-"));
	const app = await electron.launch({
		args: [
			path.join(ROOT, "dist-electron/main.js"),
			"--no-sandbox",
			`--user-data-dir=${userDataDir}`,
		],
		env: { ...process.env, ELECTRON_USER_DATA_DIR: userDataDir, HEADLESS: "false" },
	});

	try {
		const hud = await app.firstWindow({ timeout: 30_000 });
		await hud.waitForLoadState("domcontentloaded");
		const keepLanguage = hud.getByRole("button", { name: /Keep current language/i });
		if (await keepLanguage.count()) await keepLanguage.click();
		const settingsPromise = app.waitForEvent("window", {
			predicate: (window) => window.url().includes("windowType=app-settings"),
			timeout: 15_000,
		});
		await app.evaluate(({ BrowserWindow, Menu }) => {
			const findSettingsItem = (items: Electron.MenuItem[]): Electron.MenuItem | null => {
				for (const item of items) {
					if (item.label === "Settings…") return item;
					const nested = item.submenu ? findSettingsItem(item.submenu.items) : null;
					if (nested) return nested;
				}
				return null;
			};
			const item = findSettingsItem(Menu.getApplicationMenu()?.items ?? []);
			if (!item?.click) throw new Error("Settings menu item not found");
			item.click(item, BrowserWindow.getFocusedWindow() ?? undefined, undefined as never);
		});
		const settings = await settingsPromise;
		await expect(settings.getByRole("heading", { name: "Settings" })).toBeVisible();
		await expect(settings.getByRole("switch", { name: "Enable recording orb" })).toBeChecked();
		await expect(settings.getByRole("slider", { name: "Recording orb size" })).toBeVisible();
		await settings.close();

		await hud.getByTestId("launch-source-selector-button").click();
		const selector = await app.waitForEvent("window", {
			predicate: (window) => window.url().includes("windowType=source-selector"),
			timeout: 15_000,
		});
		const screenCard = selector
			.locator('[data-testid="source-selector-card"][data-source-kind="screen"]')
			.first();
		await expect(screenCard).toBeVisible({ timeout: 15_000 });
		await screenCard.click();
		await selector.getByTestId("source-selector-share-button").click();
		await expect
			.poll(() => hud.evaluate(() => window.electronAPI.getSelectedSource()))
			.not.toBeNull();

		const orbPromise = app.waitForEvent("window", {
			predicate: (window) => window.url().includes("windowType=recording-orb"),
			timeout: 30_000,
		});
		await hud.getByTestId("launch-record-button").click();
		const orb = await orbPromise;
		await expect
			.poll(() => hud.evaluate(() => window.electronAPI.getRecordingLifecycleSnapshot()), {
				timeout: 30_000,
			})
			.toMatchObject({ phase: "recording" });

		await app.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows()
				.find((window) => window.webContents.getURL().includes("windowType=hud-overlay"))
				?.minimize();
		});
		await expect.poll(() => orb.evaluate(() => document.visibilityState)).toBe("visible");

		const initial = await app.evaluate(({ BrowserWindow, screen }) => {
			const window = BrowserWindow.getAllWindows().find((item) =>
				item.webContents.getURL().includes("windowType=recording-orb"),
			);
			if (!window) throw new Error("Orb window not found");
			return {
				bounds: window.getBounds(),
				workArea: screen.getDisplayMatching(window.getBounds()).workArea,
				alwaysOnTop: window.isAlwaysOnTop(),
				focusable: window.isFocusable(),
				opacity: window.getOpacity(),
			};
		});
		expect(initial.alwaysOnTop).toBe(true);
		expect(initial.focusable).toBe(false);
		expect(initial.bounds.x).toBeGreaterThanOrEqual(initial.workArea.x);
		expect(initial.bounds.y).toBeGreaterThanOrEqual(initial.workArea.y);
		expect(initial.bounds.x + initial.bounds.width).toBeLessThanOrEqual(
			initial.workArea.x + initial.workArea.width,
		);
		expect(initial.bounds.y + initial.bounds.height).toBeLessThanOrEqual(
			initial.workArea.y + initial.workArea.height,
		);

		await hud.evaluate(() =>
			window.electronAPI.updateOrbSettings({ size: 96, transparency: 60, alwaysOnTop: false }),
		);
		await expect
			.poll(() =>
				app.evaluate(({ BrowserWindow }) => {
					const window = BrowserWindow.getAllWindows().find((item) =>
						item.webContents.getURL().includes("windowType=recording-orb"),
					);
					return window
						? {
								bounds: window.getBounds(),
								opacity: window.getOpacity(),
								top: window.isAlwaysOnTop(),
							}
						: null;
				}),
			)
			.toMatchObject({ bounds: { width: 96, height: 96 }, opacity: 0.6, top: false });

		const editorPromise = app.waitForEvent("window", {
			predicate: (window) => window.url().includes("windowType=editor"),
			timeout: 60_000,
		});
		await app.evaluate(({ BrowserWindow }) => {
			const window = BrowserWindow.getAllWindows().find((item) =>
				item.webContents.getURL().includes("windowType=recording-orb"),
			);
			window?.webContents.sendInputEvent({
				type: "mouseDown",
				x: 48,
				y: 48,
				button: "left",
				clickCount: 2,
			});
		});
		const editor = await editorPromise;
		await editor.waitForLoadState("domcontentloaded");
		await expect.poll(() => orb.isClosed()).toBe(true);
	} finally {
		await app.close().catch(() => undefined);
		fs.rmSync(userDataDir, { recursive: true, force: true });
	}
});
