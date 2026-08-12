import { afterEach, describe, expect, it, vi } from "vitest";
import { OrbClickCoordinator } from "./orbClickCoordinator";

afterEach(() => vi.useRealTimers());
describe("OrbClickCoordinator", () => {
	it("delays a single click", () => {
		vi.useFakeTimers();
		const single = vi.fn();
		new OrbClickCoordinator(250).handle(1, single, vi.fn());
		vi.advanceTimersByTime(249);
		expect(single).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(single).toHaveBeenCalledOnce();
	});
	it("cancels single and emits double exactly once", () => {
		vi.useFakeTimers();
		const single = vi.fn();
		const double = vi.fn();
		const coordinator = new OrbClickCoordinator();
		coordinator.handle(1, single, double);
		coordinator.handle(2, single, double);
		coordinator.handle(2, single, double);
		vi.runAllTimers();
		expect(single).not.toHaveBeenCalled();
		expect(double).toHaveBeenCalledOnce();
	});
});
