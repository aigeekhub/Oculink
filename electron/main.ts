import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	app,
	BrowserWindow,
	ipcMain,
	Menu,
	nativeImage,
	screen,
	session,
	systemPreferences,
	Tray,
	webContents,
} from "electron";
import { ShortcutBinding } from "../src/lib/shortcuts";
import { isDiagnosticModeEnabled, mainLogBuffer } from "./diagnostics/main-log-buffer";
import {
	loadAndRegisterGlobalShortcut,
	registerOpenAppShortcut,
	unregisterAllGlobalShortcuts,
} from "./globalShortcut";
import { mainT, setMainLocale } from "./i18n";
import { getSelectedDesktopSource, registerIpcHandlers } from "./ipc/handlers";
import { getOrbBounds } from "./recording/orbBounds";
import { OrbClickCoordinator } from "./recording/orbClickCoordinator";
import {
	DEFAULT_ORB_SETTINGS,
	type OrbSettings,
	OrbSettingsStore,
	parseOrbSettingsPatch,
} from "./recording/orbSettings";
import { RecordingLifecycle } from "./recording/recordingLifecycle";
import { acquireStableInstanceLock } from "./singleInstanceLock";
import {
	createAppSettingsWindow,
	createCountdownOverlayWindow,
	createEditorWindow,
	createHudOverlayWindow,
	createRecordingOrbWindow,
	createSourceSelectorWindow,
} from "./windows";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Use Screen & System Audio Recording permissions instead of the CoreAudio Tap API on macOS.
// Tap needs NSAudioCaptureUsageDescription in the parent app's Info.plist, which breaks when
// running from a terminal/IDE during dev.
if (process.platform === "darwin") {
	app.commandLine.appendSwitch("disable-features", "MacCatapLoopbackAudioForScreenShare");
}

// Wayland support for screen capture and window management on Wayland compositors.
if (process.platform === "linux") {
	const isWayland =
		process.env.XDG_SESSION_TYPE === "wayland" || process.env.WAYLAND_DISPLAY !== undefined;
	if (isWayland) {
		app.commandLine.appendSwitch("ozone-platform", "wayland");
		// Enable WebRTCPipeWireCapturer for screen capture on Wayland
		app.commandLine.appendSwitch("enable-features", "WaylandWindowDrag,WebRTCPipeWireCapturer");
	}
}

export const RECORDINGS_DIR = path.join(app.getPath("userData"), "recordings");

async function ensureRecordingsDir() {
	try {
		await fs.mkdir(RECORDINGS_DIR, { recursive: true });
		console.log("RECORDINGS_DIR:", RECORDINGS_DIR);
		console.log("User Data Path:", app.getPath("userData"));
	} catch (error) {
		console.error("Failed to create recordings directory:", error);
	}
}

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
	? path.join(process.env.APP_ROOT, "public")
	: RENDERER_DIST;

// Window references
let mainWindow: BrowserWindow | null = null;
let sourceSelectorWindow: BrowserWindow | null = null;
let countdownOverlayWindow: BrowserWindow | null = null;
let recordingOrbWindow: BrowserWindow | null = null;
let appSettingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let selectedSourceName = "";
const recordingLifecycle = new RecordingLifecycle();
const orbSettingsStore = new OrbSettingsStore(
	path.join(app.getPath("userData"), "recording-orb-settings.json"),
);
let orbSettings: OrbSettings = { ...DEFAULT_ORB_SETTINGS };
let orbClickCoordinator: OrbClickCoordinator | null = null;
const isMac = process.platform === "darwin";
const trayIconSize = isMac ? 16 : 24;

// Tray Icons
const defaultTrayIcon = getTrayIcon("openscreen.png", trayIconSize);
const recordingTrayIcon = getTrayIcon("rec-button.png", trayIconSize);

function createWindow() {
	if (mainWindow && !mainWindow.isDestroyed()) {
		return;
	}

	mainWindow = createHudOverlayWindow();
	mainWindow.on("minimize", syncRecordingOrbVisibility);
	mainWindow.on("restore", syncRecordingOrbVisibility);
	mainWindow.on("show", syncRecordingOrbVisibility);
}

function showMainWindow() {
	if (mainWindow && !mainWindow.isDestroyed()) {
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.show();
		mainWindow.focus();
		return;
	}

	createWindow();
}

function showAppSettingsWindow() {
	if (appSettingsWindow && !appSettingsWindow.isDestroyed()) {
		appSettingsWindow.show();
		appSettingsWindow.focus();
		return;
	}
	appSettingsWindow = createAppSettingsWindow();
	appSettingsWindow.on("closed", () => {
		appSettingsWindow = null;
	});
}

function broadcastRecordingLifecycle() {
	const snapshot = recordingLifecycle.getSnapshot();
	for (const window of BrowserWindow.getAllWindows()) {
		if (!window.isDestroyed()) {
			window.webContents.send("recording-lifecycle-changed", snapshot);
		}
	}
}

function broadcastOrbSettings() {
	for (const window of BrowserWindow.getAllWindows()) {
		if (!window.isDestroyed()) {
			window.webContents.send("orb-settings-changed", { ...orbSettings });
		}
	}
}

function getRecorderOwnerWindow(): BrowserWindow | null {
	const snapshot = recordingLifecycle.getSnapshot();
	if (!snapshot) return null;
	const ownerContents = webContents.fromId(snapshot.ownerWebContentsId);
	return ownerContents && !ownerContents.isDestroyed()
		? BrowserWindow.fromWebContents(ownerContents)
		: null;
}

function restoreRecorderOwner() {
	const ownerWindow = getRecorderOwnerWindow();
	if (!ownerWindow || ownerWindow.isDestroyed()) return;
	if (ownerWindow.isMinimized()) ownerWindow.restore();
	ownerWindow.show();
	ownerWindow.focus();
	syncRecordingOrbVisibility();
}

function destroyRecordingOrb() {
	orbClickCoordinator?.dispose();
	orbClickCoordinator = null;
	const window = recordingOrbWindow;
	recordingOrbWindow = null;
	if (window && !window.isDestroyed()) window.destroy();
}

function requestActiveRecordingStop(): boolean {
	const before = recordingLifecycle.getSnapshot();
	if (!before || before.phase !== "recording") return false;
	const after = recordingLifecycle.requestStop(before.recordingId);
	if (!after) return false;
	if (before.stopRequested) return true;

	const ownerContents = webContents.fromId(after.ownerWebContentsId);
	if (!ownerContents || ownerContents.isDestroyed()) {
		recordingLifecycle.fail(after.recordingId, "Recording controller is unavailable");
		updateTrayMenu(false);
		return false;
	}
	ownerContents.send("recording-stop-requested", after.recordingId);
	return true;
}

function resolveRecordingOrbBounds(window: BrowserWindow | null = recordingOrbWindow) {
	const displays = screen.getAllDisplays();
	const fallbackDisplay =
		window && !window.isDestroyed()
			? screen.getDisplayMatching(window.getBounds())
			: screen.getPrimaryDisplay();
	return getOrbBounds(
		displays.map((display) => ({ id: String(display.id), workArea: display.workArea })),
		orbSettings.placement,
		orbSettings.size,
		String(fallbackDisplay.id),
	);
}

function applyRecordingOrbBounds(window: BrowserWindow) {
	const bounds = resolveRecordingOrbBounds(window);
	if (bounds) window.setBounds(bounds, false);
	const availableDisplayIds = new Set(screen.getAllDisplays().map((display) => String(display.id)));
	if (
		!orbSettings.placement.displayId ||
		!availableDisplayIds.has(orbSettings.placement.displayId)
	) {
		const displayId = String(screen.getDisplayMatching(window.getBounds()).id);
		const placement = { ...orbSettings.placement, displayId };
		orbSettings = { ...orbSettings, placement };
		void orbSettingsStore.update({ placement }).catch((error) => {
			console.warn("Failed to persist recording orb display placement:", error);
		});
	}
}

function ensureRecordingOrbWindow() {
	if (!orbSettings.enabled) return null;
	if (recordingOrbWindow && !recordingOrbWindow.isDestroyed()) return recordingOrbWindow;

	const window = createRecordingOrbWindow(resolveRecordingOrbBounds(null) ?? undefined);
	recordingOrbWindow = window;
	orbClickCoordinator = new OrbClickCoordinator();
	window.setAlwaysOnTop(orbSettings.alwaysOnTop);
	window.setOpacity(orbSettings.transparency / 100);
	applyRecordingOrbBounds(window);
	window.webContents.on("before-mouse-event", (event, input) => {
		if (input.type !== "mouseDown" || input.button !== "left") return;
		event.preventDefault();
		orbClickCoordinator?.handle(
			Math.max(1, input.clickCount ?? 1),
			restoreRecorderOwner,
			requestActiveRecordingStop,
		);
	});
	window.once("ready-to-show", syncRecordingOrbVisibility);
	window.on("closed", () => {
		if (recordingOrbWindow === window) recordingOrbWindow = null;
		orbClickCoordinator?.dispose();
		orbClickCoordinator = null;
	});
	return window;
}

function syncRecordingOrbVisibility() {
	const snapshot = recordingLifecycle.getSnapshot();
	const isActive = snapshot?.phase === "recording" || snapshot?.phase === "stopping";
	const controllerMinimized = Boolean(
		mainWindow && !mainWindow.isDestroyed() && mainWindow.isMinimized(),
	);
	if (!orbSettings.enabled || !isActive) {
		destroyRecordingOrb();
		return;
	}

	const window = ensureRecordingOrbWindow();
	if (!window || window.isDestroyed()) return;
	window.setAlwaysOnTop(orbSettings.alwaysOnTop);
	window.setOpacity(orbSettings.transparency / 100);
	applyRecordingOrbBounds(window);
	if (controllerMinimized) {
		if (window.isVisible()) return;
		window.showInactive();
	} else if (window.isVisible()) {
		window.hide();
	}
}

function parseFinalizationOutcome(
	value: unknown,
): { status: "completed" | "failed" | "discarded"; error?: string } | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record);
	if (keys.some((key) => key !== "status" && key !== "error")) return null;
	if (!["completed", "failed", "discarded"].includes(String(record.status))) return null;
	if ("error" in record && typeof record.error !== "string") return null;
	return {
		status: record.status as "completed" | "failed" | "discarded",
		...((record.error as string | undefined) ? { error: record.error as string } : {}),
	};
}

function registerRecordingOrbIpc() {
	ipcMain.handle("get-recording-lifecycle-snapshot", () => recordingLifecycle.getSnapshot());
	ipcMain.handle("get-orb-settings", () => ({ ...orbSettings }));
	ipcMain.handle("set-recording-paused", (event, recordingId: number, paused: boolean) => {
		const snapshot = recordingLifecycle.getSnapshot();
		if (
			!snapshot ||
			snapshot.recordingId !== recordingId ||
			snapshot.ownerWebContentsId !== event.sender.id ||
			typeof paused !== "boolean"
		) {
			return { success: false, error: "Invalid recording pause transition" };
		}
		recordingLifecycle.setPaused(recordingId, paused);
		return { success: true };
	});
	ipcMain.handle("update-orb-settings", async (_event, value: unknown) => {
		const patch = parseOrbSettingsPatch(value);
		if (!patch) return { success: false };
		try {
			orbSettings = await orbSettingsStore.update(patch);
			broadcastOrbSettings();
			syncRecordingOrbVisibility();
			return { success: true, settings: { ...orbSettings } };
		} catch (error) {
			console.error("Failed to persist recording orb settings:", error);
			return { success: false };
		}
	});
	ipcMain.handle("reset-orb-settings", async () => {
		try {
			orbSettings = await orbSettingsStore.reset();
			broadcastOrbSettings();
			syncRecordingOrbVisibility();
			return { success: true, settings: { ...orbSettings } };
		} catch (error) {
			console.error("Failed to reset recording orb settings:", error);
			return { success: false };
		}
	});
	ipcMain.handle("report-recording-finalization", (event, recordingId: number, value: unknown) => {
		const snapshot = recordingLifecycle.getSnapshot();
		const outcome = parseFinalizationOutcome(value);
		if (
			!snapshot ||
			!Number.isSafeInteger(recordingId) ||
			recordingId !== snapshot.recordingId ||
			event.sender.id !== snapshot.ownerWebContentsId ||
			!outcome
		) {
			return { success: false, error: "Invalid or stale recording finalization" };
		}

		if (outcome.status === "completed") {
			if (snapshot.phase === "completed") return { success: true };
			if (snapshot.phase === "failed") {
				return { success: false, error: "Recording has already failed" };
			}
			recordingLifecycle.complete(recordingId);
			updateTrayMenu(false);
			createEditorWindowWrapper();
			return { success: true };
		}
		if (outcome.status === "failed") {
			if (snapshot.phase === "failed") return { success: true };
			if (snapshot.phase === "completed") {
				return { success: false, error: "Recording has already completed" };
			}
			recordingLifecycle.fail(recordingId, outcome.error ?? "Recording finalization failed");
			updateTrayMenu(false);
			return { success: true };
		}

		if (snapshot.phase === "completed" || snapshot.phase === "failed") {
			return { success: false, error: "Recording has already finalized" };
		}
		recordingLifecycle.clear(recordingId);
		updateTrayMenu(false);
		return { success: true };
	});
}

recordingLifecycle.subscribe(() => {
	broadcastRecordingLifecycle();
	syncRecordingOrbVisibility();
});

const stableInstanceLock = acquireStableInstanceLock();
const hasElectronSingleInstanceLock = app.requestSingleInstanceLock();
const hasSingleInstanceLock = Boolean(stableInstanceLock && hasElectronSingleInstanceLock);

if (hasSingleInstanceLock) {
	app.on("second-instance", () => {
		showMainWindow();
	});
} else {
	stableInstanceLock?.release();
	app.quit();
}

function isEditorWindow(window: BrowserWindow) {
	return window.webContents.getURL().includes("windowType=editor");
}

function sendEditorMenuAction(
	channel: "menu-load-project" | "menu-save-project" | "menu-save-project-as" | "menu-new-project",
) {
	let targetWindow = BrowserWindow.getFocusedWindow() ?? mainWindow;

	if (!targetWindow || targetWindow.isDestroyed() || !isEditorWindow(targetWindow)) {
		createEditorWindowWrapper();
		targetWindow = mainWindow;
		if (!targetWindow || targetWindow.isDestroyed()) return;

		targetWindow.webContents.once("did-finish-load", () => {
			if (!targetWindow || targetWindow.isDestroyed()) return;
			targetWindow.webContents.send(channel);
		});
		return;
	}

	targetWindow.webContents.send(channel);
}

function setupApplicationMenu() {
	const isMac = process.platform === "darwin";
	const template: Electron.MenuItemConstructorOptions[] = [];

	if (isMac) {
		template.push({
			label: app.name,
			submenu: [
				{
					role: "about",
					label: mainT("common", "actions.about") || "About OpenScreen",
				},
				{ type: "separator" },
				{
					label: "Settings…",
					accelerator: "CmdOrCtrl+,",
					click: showAppSettingsWindow,
				},
				{ type: "separator" },
				{
					role: "services",
					label: mainT("common", "actions.services") || "Services",
				},
				{ type: "separator" },
				{
					role: "hide",
					label: mainT("common", "actions.hide") || "Hide OpenScreen",
				},
				{
					role: "hideOthers",
					label: mainT("common", "actions.hideOthers") || "Hide Others",
				},
				{
					role: "unhide",
					label: mainT("common", "actions.unhide") || "Show All",
				},
				{ type: "separator" },
				{ role: "quit", label: mainT("common", "actions.quit") || "Quit" },
			],
		});
	}

	template.push(
		{
			label: mainT("common", "actions.file") || "File",
			submenu: [
				{
					label: mainT("dialogs", "unsavedChanges.newProject") || "New Project",
					accelerator: "CmdOrCtrl+N",
					click: () => sendEditorMenuAction("menu-new-project"),
				},
				{ type: "separator" as const },
				{
					label: mainT("dialogs", "unsavedChanges.loadProject") || "Load Project…",
					accelerator: "CmdOrCtrl+O",
					click: () => sendEditorMenuAction("menu-load-project"),
				},
				{
					label: mainT("dialogs", "unsavedChanges.saveProject") || "Save Project…",
					accelerator: "CmdOrCtrl+S",
					click: () => sendEditorMenuAction("menu-save-project"),
				},
				{
					label: mainT("dialogs", "unsavedChanges.saveProjectAs") || "Save Project As…",
					accelerator: "CmdOrCtrl+Shift+S",
					click: () => sendEditorMenuAction("menu-save-project-as"),
				},
				...(isMac
					? []
					: [
							{ type: "separator" as const },
							{
								label: "Settings…",
								accelerator: "CmdOrCtrl+,",
								click: showAppSettingsWindow,
							},
							{ type: "separator" as const },
							{
								role: "quit" as const,
								label: mainT("common", "actions.quit") || "Quit",
							},
						]),
			],
		},
		{
			label: mainT("common", "actions.edit") || "Edit",
			submenu: [
				{ role: "undo", label: mainT("common", "actions.undo") || "Undo" },
				{ role: "redo", label: mainT("common", "actions.redo") || "Redo" },
				{ type: "separator" },
				{ role: "cut", label: mainT("common", "actions.cut") || "Cut" },
				{ role: "copy", label: mainT("common", "actions.copy") || "Copy" },
				{ role: "paste", label: mainT("common", "actions.paste") || "Paste" },
				{
					role: "selectAll",
					label: mainT("common", "actions.selectAll") || "Select All",
				},
			],
		},
		{
			label: mainT("common", "actions.view") || "View",
			submenu: [
				{
					role: "reload",
					label: mainT("common", "actions.reload") || "Reload",
				},
				{
					role: "forceReload",
					label: mainT("common", "actions.forceReload") || "Force Reload",
				},
				{
					role: "toggleDevTools",
					label: mainT("common", "actions.toggleDevTools") || "Toggle Developer Tools",
				},
				{ type: "separator" },
				{
					role: "resetZoom",
					label: mainT("common", "actions.actualSize") || "Actual Size",
				},
				{
					role: "zoomIn",
					label: mainT("common", "actions.zoomIn") || "Zoom In",
				},
				{
					role: "zoomOut",
					label: mainT("common", "actions.zoomOut") || "Zoom Out",
				},
				{ type: "separator" },
				{
					role: "togglefullscreen",
					label: mainT("common", "actions.toggleFullScreen") || "Toggle Full Screen",
				},
			],
		},
		{
			label: mainT("common", "actions.window") || "Window",
			submenu: isMac
				? [
						{
							role: "minimize",
							label: mainT("common", "actions.minimize") || "Minimize",
						},
						{ role: "zoom" },
						{ type: "separator" },
						{ role: "front" },
					]
				: [
						{
							role: "minimize",
							label: mainT("common", "actions.minimize") || "Minimize",
						},
						{
							role: "close",
							label: mainT("common", "actions.close") || "Close",
						},
					],
		},
	);

	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}

function createTray() {
	tray = new Tray(defaultTrayIcon);
	tray.on("click", () => {
		showMainWindow();
	});
	tray.on("double-click", () => {
		showMainWindow();
	});
}

function getTrayIcon(filename: string, size: number) {
	return nativeImage
		.createFromPath(path.join(process.env.VITE_PUBLIC || RENDERER_DIST, filename))
		.resize({
			width: size,
			height: size,
			quality: "best",
		});
}

function updateTrayMenu(recording: boolean = false) {
	if (!tray) return;
	const trayIcon = recording ? recordingTrayIcon : defaultTrayIcon;
	const trayToolTip = recording
		? mainT("common", "actions.recordingStatus", {
				source: selectedSourceName,
			}) || `Recording: ${selectedSourceName}`
		: "OpenScreen";
	const menuTemplate = recording
		? [
				{
					label: mainT("common", "actions.stopRecording") || "Stop Recording",
					click: requestActiveRecordingStop,
				},
			]
		: [
				{
					label: mainT("common", "actions.open") || "Open",
					click: () => {
						showMainWindow();
					},
				},
				{
					label: mainT("common", "actions.quit") || "Quit",
					click: () => {
						app.quit();
					},
				},
			];
	tray.setImage(trayIcon);
	tray.setToolTip(trayToolTip);
	tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
}

let editorHasUnsavedChanges = false;
let isForceClosing = false;
let isCloseConfirmInFlight = false;

ipcMain.on("set-has-unsaved-changes", (_, hasChanges: boolean) => {
	editorHasUnsavedChanges = hasChanges;
});

function forceCloseEditorWindow(windowToClose: BrowserWindow | null) {
	if (!windowToClose || windowToClose.isDestroyed()) return;

	isForceClosing = true;
	setImmediate(() => {
		try {
			if (!windowToClose.isDestroyed()) {
				windowToClose.close();
			}
		} finally {
			isForceClosing = false;
		}
	});
}

function createEditorWindowWrapper() {
	const previousWindow = mainWindow;
	mainWindow = createEditorWindow();

	if (previousWindow && !previousWindow.isDestroyed()) {
		isForceClosing = true;
		previousWindow.close();
		isForceClosing = false;
	}
	editorHasUnsavedChanges = false;

	mainWindow.on("close", (event) => {
		if (isForceClosing || !editorHasUnsavedChanges || isCloseConfirmInFlight) return;

		event.preventDefault();
		isCloseConfirmInFlight = true;

		const windowToClose = mainWindow;
		if (!windowToClose || windowToClose.isDestroyed()) return;

		// Ask renderer to show the in-app close dialog.
		windowToClose.webContents.send("request-close-confirm");

		ipcMain.once("close-confirm-response", (event, choice: "save" | "discard" | "cancel") => {
			if (event.sender.id !== windowToClose?.webContents.id) return;
			isCloseConfirmInFlight = false;
			if (!windowToClose || windowToClose.isDestroyed()) return;

			if (choice === "save") {
				// Save first, then close when the renderer reports done.
				windowToClose.webContents.send("request-save-before-close");
				ipcMain.once("save-before-close-done", (event, shouldClose: boolean) => {
					if (event.sender.id !== windowToClose?.webContents.id) return;
					if (!shouldClose) return;
					forceCloseEditorWindow(windowToClose);
				});
			} else if (choice === "discard") {
				forceCloseEditorWindow(windowToClose);
			}
			// "cancel": flag reset, window stays open
		});
	});
}

function createSourceSelectorWindowWrapper() {
	sourceSelectorWindow = createSourceSelectorWindow();
	sourceSelectorWindow.on("closed", () => {
		sourceSelectorWindow = null;
		if (mainWindow && !mainWindow.isDestroyed()) {
			mainWindow.webContents.send("source-selector-closed");
		}
	});
	return sourceSelectorWindow;
}

function createCountdownOverlayWindowWrapper() {
	if (countdownOverlayWindow && !countdownOverlayWindow.isDestroyed()) {
		return countdownOverlayWindow;
	}

	countdownOverlayWindow = createCountdownOverlayWindow();
	countdownOverlayWindow.on("closed", () => {
		countdownOverlayWindow = null;
	});
	return countdownOverlayWindow;
}

// Closing every window quits the app (tray goes too). The in-app "Return to Recorder"
// button covers the editor-to-HUD round-trip, so closing the last window means "I'm done".
app.on("window-all-closed", () => {
	const snapshot = recordingLifecycle.getSnapshot();
	if (snapshot?.phase === "recording" || snapshot?.phase === "stopping") return;
	app.quit();
});

app.on("activate", () => {
	// On macOS, re-open a window when the dock icon is clicked and none are open.
	const hasVisibleWindow = BrowserWindow.getAllWindows().some((window) => {
		if (window.isDestroyed() || !window.isVisible()) {
			return false;
		}

		const url = window.webContents.getURL();
		const isCountdownOverlayWindow = url.includes("windowType=countdown-overlay");
		const isRecordingOrbWindow = url.includes("windowType=recording-orb");
		return !isCountdownOverlayWindow && !isRecordingOrbWindow;
	});
	if (!hasVisibleWindow) {
		showMainWindow();
	}
});

app.on("will-quit", () => {
	destroyRecordingOrb();
	unregisterAllGlobalShortcuts();
	stableInstanceLock?.release();
});

const appReady = hasSingleInstanceLock ? app.whenReady() : null;

appReady?.then(async () => {
	if (isDiagnosticModeEnabled()) {
		mainLogBuffer.install();
		console.info("[diagnostic] OPENSCREEN_DIAGNOSTIC=1, capturing console.* into ring buffer");
	}

	orbSettings = await orbSettingsStore.load();
	registerRecordingOrbIpc();
	const reclampRecordingOrb = () => {
		if (recordingOrbWindow && !recordingOrbWindow.isDestroyed()) {
			applyRecordingOrbBounds(recordingOrbWindow);
		}
	};
	screen.on("display-added", reclampRecordingOrb);
	screen.on("display-removed", reclampRecordingOrb);
	screen.on("display-metrics-changed", reclampRecordingOrb);

	// Force "regular" activation policy so the Dock icon appears. The HUD overlay
	// (transparent, frameless, skipTaskbar) is the first window, and AppKit would
	// otherwise classify us as an accessory app.
	if (process.platform === "darwin") {
		app.dock?.show();
	}

	session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
		const allowed = [
			"media",
			"audioCapture",
			"microphone",
			"videoCapture",
			"camera",
			"screen",
			"display-capture",
		];
		return allowed.includes(permission);
	});

	session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
		const allowed = [
			"media",
			"audioCapture",
			"microphone",
			"videoCapture",
			"camera",
			"screen",
			"display-capture",
		];
		callback(allowed.includes(permission));
	});

	session.defaultSession.setDisplayMediaRequestHandler(
		(request, callback) => {
			const source = getSelectedDesktopSource();
			if (!request.videoRequested || !source) {
				callback({});
				return;
			}

			callback({
				video: source,
				...(request.audioRequested && process.platform === "win32" ? { audio: "loopback" } : {}),
			});
		},
		{ useSystemPicker: false },
	);

	// Request mic permission now. Screen Recording is requested lazily from the
	// source-picker action so its prompt isn't hidden behind the selector window.
	if (process.platform === "darwin") {
		const micStatus = systemPreferences.getMediaAccessStatus("microphone");
		if (micStatus !== "granted") {
			await systemPreferences.askForMediaAccess("microphone");
		}
	}

	ipcMain.on("hud-overlay-close", () => {
		app.quit();
	});
	ipcMain.handle("set-locale", (_, locale: string) => {
		setMainLocale(locale);
		setupApplicationMenu();
		updateTrayMenu();
	});

	ipcMain.handle("update-global-shortcut", (_, binding: ShortcutBinding) => {
		const success = registerOpenAppShortcut(binding, showMainWindow);
		return { success };
	});

	createTray();
	updateTrayMenu();
	setupApplicationMenu();
	await ensureRecordingsDir();

	function switchToHudWrapper() {
		if (mainWindow) {
			isForceClosing = true;
			mainWindow.close();
			isForceClosing = false;
			mainWindow = null;
		}
		showMainWindow();
	}

	registerIpcHandlers(
		createEditorWindowWrapper,
		createSourceSelectorWindowWrapper,
		createCountdownOverlayWindowWrapper,
		() => mainWindow,
		() => sourceSelectorWindow,
		() => countdownOverlayWindow,
		(recording, sourceName, change) => {
			selectedSourceName = sourceName;
			if (!tray) createTray();
			if (
				recording &&
				Number.isSafeInteger(change.recordingId) &&
				(change.recordingId ?? 0) > 0 &&
				Number.isSafeInteger(change.ownerWebContentsId) &&
				change.ownerWebContentsId > 0
			) {
				const recordingId = change.recordingId as number;
				const started = recordingLifecycle.start(recordingId, change.ownerWebContentsId);
				if (!started) return;
				if (typeof change.paused === "boolean") {
					recordingLifecycle.setPaused(recordingId, change.paused);
				}
				updateTrayMenu(true);
				return;
			}
			if (!recording && Number.isSafeInteger(change.recordingId)) {
				recordingLifecycle.requestStop(change.recordingId as number);
			}
		},
		switchToHudWrapper,
	);

	await loadAndRegisterGlobalShortcut(showMainWindow);

	createWindow();
});
