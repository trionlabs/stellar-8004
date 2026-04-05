<script lang="ts">
	import { wallet } from '$lib/wallet.svelte.js';
	import { scoreFormatter, dateFormatter, dateTimeFormatter, shortAddress } from '$lib/formatters.js';
	import FeedbackForm from '$lib/components/FeedbackForm.svelte';
	import ValidationForm from '$lib/components/ValidationForm.svelte';
	import ScoreBreakdown from '$lib/components/ScoreBreakdown.svelte';
	import EvidenceViewer from '$lib/components/EvidenceViewer.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const tabs = [
		{ id: 'metadata', label: 'Metadata' },
		{ id: 'reputation', label: 'Reputation' },
		{ id: 'validation', label: 'Validation' }
	] as const;

	type TabId = (typeof tabs)[number]['id'];

	let activeTab = $state<TabId>('reputation');

	const isOwner = $derived.by(
		() => wallet.address?.toUpperCase() === data.agent.owner.toUpperCase()
	);
</script>

<svelte:head>
	<title>{data.agent.name} | 8004scan Stellar</title>
	<meta
		name="description"
		content="Inspect on-chain metadata, feedback, validation requests, and aggregate trust scores for a Stellar ERC-8004 agent."
	/>
</svelte:head>

<div class="space-y-10">
	<section class="space-y-8">
		<div class="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
			<div class="flex flex-col gap-4 sm:flex-row">
				<div
					class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-raised text-xl font-light text-accent"
				>
					{#if data.agent.image}
						<img src={data.agent.image} alt="" class="h-full w-full object-cover" />
					{:else}
						{data.agent.name.charAt(0)}
					{/if}
				</div>

				<div class="space-y-3">
					<div class="space-y-2">
						<span class="inline-flex items-center gap-1.5 rounded-full border border-accent/12 bg-accent/4 px-3 py-1 text-[10px] tracking-[0.18em] text-accent uppercase">
							<span class="h-1 w-1 rounded-full bg-accent"></span>
							Agent #{data.agent.id}
						</span>
						<h1 class="text-2xl font-light tracking-tight text-text sm:text-3xl">{data.agent.name}</h1>
						{#if data.agent.description}
							<p class="mt-2 max-w-2xl text-sm leading-relaxed text-text-muted">
								{data.agent.description}
							</p>
						{/if}
					</div>

					<div class="flex flex-wrap gap-2 text-xs text-text-muted">
						<span class="rounded-md border border-border bg-surface-raised px-2.5 py-1 font-mono">
							{shortAddress(data.agent.owner)}
						</span>
						{#if data.agent.wallet}
							<span class="rounded-md border border-border bg-surface-raised px-2.5 py-1 font-mono">
								{shortAddress(data.agent.wallet)}
							</span>
						{/if}
						<span class="rounded-md border border-border bg-surface-raised px-2.5 py-1">
							{dateFormatter.format(new Date(data.agent.createdAt))}
						</span>
					</div>

					{#if wallet.connected && isOwner}
						<p class="text-xs text-positive">Connected wallet matches this agent owner</p>
					{/if}
				</div>
			</div>

			<div class="grid min-w-full gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 xl:min-w-[18rem] xl:grid-cols-1">
				<div class="bg-surface p-4">
					<p class="text-xs text-text-dim">Total Score</p>
					<p class="mt-1.5 text-xl font-light text-positive">
						{#if data.scores?.totalScore != null}
							{scoreFormatter.format(data.scores.totalScore)}
						{:else}
							<span class="text-text-dim">Pending</span>
						{/if}
					</p>
					{#if data.scores}
						<div class="mt-2">
							<ScoreBreakdown
								avgScore={data.scores.avgScore ?? 0}
								feedbackCount={data.scores.feedbackCount ?? 0}
								avgValidationScore={data.scores.avgValidationScore ?? 0}
								totalScore={data.scores.totalScore ?? 0}
							/>
						</div>
					{/if}
				</div>
				<div class="bg-surface p-4">
					<p class="text-xs text-text-dim">Feedback</p>
					<p class="mt-1.5 text-xl font-light text-text">{data.scores?.feedbackCount ?? 0}</p>
				</div>
				<div class="bg-surface p-4">
					<p class="text-xs text-text-dim">Validators</p>
					<p class="mt-1.5 text-xl font-light text-text">{data.scores?.validationCount ?? 0}</p>
				</div>
			</div>
		</div>

		<div class="flex gap-1">
			{#each tabs as tab (tab.id)}
				<button
					type="button"
					onclick={() => (activeTab = tab.id)}
					class={`rounded-md px-3 py-1.5 text-sm transition ${
						activeTab === tab.id
							? 'bg-accent-soft text-accent'
							: 'text-text-muted hover:text-text'
					}`}
				>
					{tab.label}
				</button>
			{/each}
		</div>
	</section>

	{#if activeTab === 'metadata'}
		<section class="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
			<div class="space-y-4">
				<div>
					<h2 class="text-sm font-medium text-text">On-chain Metadata</h2>
					<p class="mt-1 text-xs text-text-dim">Additional key-value entries indexed for this agent</p>
				</div>

				{#if data.metadata.length > 0}
					<div class="overflow-hidden rounded-lg border border-border bg-surface">
						{#each data.metadata as entry (entry.key)}
							<div class="flex border-t border-border px-4 py-3 text-xs font-mono">
								<span class="w-40 shrink-0 text-accent">{entry.key}</span>
								<span class="text-text-muted">{entry.value ?? ''}</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-dim">
						No extra metadata indexed
					</div>
				{/if}
			</div>

			<div class="space-y-4">
				<div>
					<h2 class="text-sm font-medium text-text">Registration Payload</h2>
					<p class="mt-1 text-xs text-text-dim">Decoded agent_uri_data payload</p>
				</div>

				{#if data.agent.agentUri}
					<div class="rounded-lg border border-border bg-surface p-4">
						<p class="text-xs text-text-dim">Agent URI</p>
						<p class="mt-1.5 break-all font-mono text-xs text-text-muted">{data.agent.agentUri}</p>
					</div>
				{/if}

				{#if data.agent.registrationData}
					<pre
						class="overflow-auto rounded-lg border border-border bg-surface p-4 text-xs leading-relaxed text-text-muted">{data
							.agent.registrationData}</pre>
				{:else}
					<div class="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-dim">
						No structured registration payload
					</div>
				{/if}
			</div>
		</section>
	{:else if activeTab === 'reputation'}
		<section class="space-y-8">
			<div class="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
				<div class="bg-surface p-4">
					<p class="text-xs text-text-dim">Average Score</p>
					<p class="mt-1.5 text-xl font-light text-text">
						{scoreFormatter.format(data.scores?.avgScore ?? 0)}
					</p>
				</div>
				<div class="bg-surface p-4">
					<p class="text-xs text-text-dim">Unique Clients</p>
					<p class="mt-1.5 text-xl font-light text-text">{data.scores?.uniqueClients ?? 0}</p>
				</div>
				<div class="bg-surface p-4">
					<p class="text-xs text-text-dim">Feedback Rows</p>
					<p class="mt-1.5 text-xl font-light text-text">{data.feedback.length}</p>
				</div>
			</div>

			{#if wallet.connected}
				<FeedbackForm agentId={data.agent.id} />
			{/if}

			<div class="overflow-hidden rounded-lg border border-border bg-surface">
				<div class="border-b border-border px-6 py-4">
					<h2 class="text-sm font-medium text-text">Reputation Feed</h2>
				</div>

				{#if data.feedback.length > 0}
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead
								class="bg-surface-raised text-left text-xs tracking-[0.12em] text-text-dim uppercase"
							>
								<tr>
									<th class="px-6 py-3 font-medium">Client</th>
									<th class="px-6 py-3 text-right font-medium">Score</th>
									<th class="px-6 py-3 font-medium">Tag</th>
									<th class="px-6 py-3 font-medium">Responses</th>
									<th class="px-6 py-3 font-medium">Status</th>
									<th class="px-6 py-3 font-medium">Evidence</th>
									<th class="px-6 py-3 font-medium">Date</th>
								</tr>
							</thead>
							<tbody>
								{#each data.feedback as feedback (feedback.id)}
									<tr class:opacity-40={feedback.isRevoked} class="border-t border-border">
										<td class="px-6 py-3 font-mono text-xs text-text-muted">
											{shortAddress(feedback.clientAddress)}
										</td>
										<td class="px-6 py-3 text-right font-medium text-positive">
											{scoreFormatter.format(feedback.score)}
										</td>
										<td class="px-6 py-3 text-text-muted">
											{#if feedback.tag1}
												<div class="flex flex-wrap gap-1.5">
													<span
														class="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent"
													>
														{feedback.tag1}
													</span>
													{#if feedback.tag2}
														<span
															class="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent"
														>
															{feedback.tag2}
														</span>
													{/if}
												</div>
											{:else}
												<span class="text-text-dim">No tags</span>
											{/if}
										</td>
										<td class="px-6 py-3 text-xs text-text-muted">
											{#if feedback.responses.length > 0}
												<div class="flex flex-wrap gap-1.5">
													{#each feedback.responses.slice(0, 2) as response (response.id)}
														<span
															class="rounded-md border border-border bg-surface-raised px-1.5 py-0.5 font-mono text-[11px]"
														>
															{shortAddress(response.responder)}
														</span>
													{/each}
													{#if feedback.responses.length > 2}
														<span
															class="rounded-md border border-border bg-surface-raised px-1.5 py-0.5 text-[11px] text-text-dim"
														>
															+{feedback.responses.length - 2}
														</span>
													{/if}
												</div>
											{:else}
												<span class="text-text-dim">None</span>
											{/if}
										</td>
										<td class="px-6 py-3 text-xs">
											{#if feedback.isRevoked}
												<span
													class="rounded-full bg-negative-soft px-2 py-0.5 text-negative"
												>
													Revoked
												</span>
											{:else}
												<span
													class="rounded-full bg-positive-soft px-2 py-0.5 text-positive"
												>
													Active
												</span>
											{/if}
										</td>
										<td class="px-6 py-3">
										<EvidenceViewer
											feedbackUri={feedback.feedbackUri}
											feedbackHash={feedback.feedbackHash}
										/>
									</td>
									<td class="px-6 py-3 text-xs text-text-dim">
										{dateTimeFormatter.format(new Date(feedback.createdAt))}
									</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="px-6 py-8 text-center text-sm text-text-dim">
						No reputation entries indexed yet
					</div>
				{/if}
			</div>
		</section>
	{:else}
		<section class="space-y-8">
			<div class="grid gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-2">
				<div class="bg-surface p-4">
					<p class="text-xs text-text-dim">Validation Requests</p>
					<p class="mt-1.5 text-xl font-light text-text">{data.validations.length}</p>
				</div>
				<div class="bg-surface p-4">
					<p class="text-xs text-text-dim">Average Validation</p>
					<p class="mt-1.5 text-xl font-light text-text">
						{scoreFormatter.format(data.scores?.avgValidationScore ?? 0)}
					</p>
				</div>
			</div>

			{#if wallet.connected && isOwner}
				<ValidationForm agentId={data.agent.id} />
			{/if}

			<div class="overflow-hidden rounded-lg border border-border bg-surface">
				<div class="border-b border-border px-6 py-4">
					<h2 class="text-sm font-medium text-text">Validation Requests</h2>
				</div>

				{#if data.validations.length > 0}
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead
								class="bg-surface-raised text-left text-xs tracking-[0.12em] text-text-dim uppercase"
							>
								<tr>
									<th class="px-6 py-3 font-medium">Validator</th>
									<th class="px-6 py-3 font-medium">Tag</th>
									<th class="px-6 py-3 text-right font-medium">Score</th>
									<th class="px-6 py-3 font-medium">Status</th>
									<th class="px-6 py-3 font-medium">Requested</th>
									<th class="px-6 py-3 font-medium">Responded</th>
								</tr>
							</thead>
							<tbody>
								{#each data.validations as validation (`${validation.validatorAddress}:${validation.createdAt}`)}
									<tr class="border-t border-border">
										<td class="px-6 py-3 font-mono text-xs text-text-muted">
											{shortAddress(validation.validatorAddress)}
										</td>
										<td class="px-6 py-3 text-text-muted">
											{#if validation.tag}
												<span
													class="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent"
												>
													{validation.tag}
												</span>
											{:else}
												<span class="text-text-dim">No tag</span>
											{/if}
										</td>
										<td class="px-6 py-3 text-right font-medium">
											{#if validation.hasResponse && validation.score != null}
												<span class="text-positive">
													{scoreFormatter.format(validation.score)} / 100
												</span>
											{:else}
												<span class="text-text-dim">Pending</span>
											{/if}
										</td>
										<td class="px-6 py-3 text-xs">
											{#if validation.hasResponse}
												<span
													class="rounded-full bg-positive-soft px-2 py-0.5 text-positive"
												>
													Responded
												</span>
											{:else}
												<span
													class="rounded-full bg-warning-soft px-2 py-0.5 text-warning"
												>
													Pending
												</span>
											{/if}
										</td>
										<td class="px-6 py-3 text-xs text-text-dim">
											{dateTimeFormatter.format(new Date(validation.createdAt))}
										</td>
										<td class="px-6 py-3 text-xs text-text-dim">
											{#if validation.respondedAt}
												{dateTimeFormatter.format(new Date(validation.respondedAt))}
											{:else}
												—
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="px-6 py-8 text-center text-sm text-text-dim">
						No validation requests indexed yet
					</div>
				{/if}
			</div>
		</section>
	{/if}
</div>
