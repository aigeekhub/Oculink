export class OrbClickCoordinator {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private stopIssued = false;

	constructor(private readonly delayMs = 250) {}

	handle(clickCount: number, onSingle: () => void, onDouble: () => void): void {
		if (clickCount >= 2) {
			if (this.timer) clearTimeout(this.timer);
			this.timer = null;
			if (!this.stopIssued) {
				this.stopIssued = true;
				onDouble();
			}
			return;
		}
		if (this.timer || this.stopIssued) return;
		this.timer = setTimeout(() => {
			this.timer = null;
			onSingle();
		}, this.delayMs);
	}

	dispose(): void {
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}
}
