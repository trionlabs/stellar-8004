// Shared class strings for the registration flow: tinted fields, toggle chips, one dark primary button.
export const field =
	'w-full rounded-xl bg-surface-raised px-4 py-3 text-sm text-text transition-colors placeholder:text-text-dim hover:bg-surface-overlay focus:bg-surface-overlay focus:ring-1 focus:ring-accent/40 focus:outline-none';

export const chip = (on: boolean) =>
	`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors focus-visible:ring-1 focus-visible:ring-accent/50 focus-visible:outline-none ${
		on
			? 'bg-accent-medium text-text'
			: 'bg-surface-raised text-text-dim hover:bg-surface-overlay hover:text-text'
	}`;

export const primary =
	'inline-flex items-center gap-2 rounded-full bg-text px-5 py-2.5 text-sm font-medium text-surface transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none disabled:opacity-25';
