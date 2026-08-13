export type RecordingFinalizationOutcome =
	| { status: "completed" }
	| { status: "failed"; error: string };

type PersistBeforeCompletionOptions<T> = {
	persist: () => Promise<T>;
	assign: (value: T) => Promise<void>;
	report: (outcome: RecordingFinalizationOutcome) => Promise<unknown>;
};

export type RecordingFinalizationResult<T> =
	| { success: true; value: T }
	| { success: false; error: string };

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function persistBeforeCompletion<T>({
	persist,
	assign,
	report,
}: PersistBeforeCompletionOptions<T>): Promise<RecordingFinalizationResult<T>> {
	try {
		const value = await persist();
		await assign(value);
		await report({ status: "completed" });
		return { success: true, value };
	} catch (error) {
		const message = getErrorMessage(error);
		await report({ status: "failed", error: message });
		return { success: false, error: message };
	}
}
