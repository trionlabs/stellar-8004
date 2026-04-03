<script lang="ts">
	import { wallet } from '$lib/wallet.svelte.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const tabs = [
		{ id: 'metadata', label: 'Metadata' },
		{ id: 'reputation', label: 'Reputation' },
		{ id: 'validation', label: 'Validation' }
	] as const;

	type TabId = (typeof tabs)[number]['id'];

	let activeTab = $state<TabId>('reputation');

	const scoreFormatter = new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2
	});
	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC'
	});
	const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZone: 'UTC'
	});

	const isOwner = $derived.by(
		() => wallet.address?.toUpperCase() === data.agent.owner.toUpperCase()
	);

	function shortAddress(value: string): string {
		return `${value.slice(0, 6)}...${value.slice(-4)}`;
	}
</script>

<svelte:head>
	<title>{data.agent.name} | 8004scan Stellar</title>
	<meta
		name="description"
		content="Inspect on-chain metadata, feedback, validation requests, and aggregate trust scores for a Stellar ERC-8004 agent."
	/>
</svelte:head>

<div class="space-y-8">
	<section class="rounded-[2rem] border border-gray-800 bg-gray-900/70 p-6">
		<div class="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
			<div class="flex flex-col gap-5 sm:flex-row">
				<div
					class="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[1.5rem] border border-gray-800 bg-gray-950 text-2xl font-semibold text-indigo-200"
				>
					{#if data.agent.image}
						<img src={data.agent.image} alt="" class="h-full w-full object-cover" />
					{:else}
						{data.agent.name.charAt(0)}
					{/if}
				</div>

				<div class="space-y-4">
					<div>
						<p class="text-xs tracking-[0.18em] text-indigo-300 uppercase">Agent Profile</p>
						<h1 class="mt-2 text-3xl font-semibold text-white sm:text-4xl">{data.agent.name}</h1>
						{#if data.agent.description}
							<p class="mt-3 max-w-3xl text-sm leading-7 text-gray-400 sm:text-base">
								{data.agent.description}
							</p>
						{/if}
					</div>

					<div class="flex flex-wrap gap-3 text-xs text-gray-400">
						<span class="rounded-full border border-gray-800 bg-gray-950 px-3 py-1.5">
							Agent #{data.agent.id}
						</span>
						<span class="rounded-full border border-gray-800 bg-gray-950 px-3 py-1.5 font-mono">
							Owner {shortAddress(data.agent.owner)}
						</span>
						{#if data.agent.wallet}
							<span class="rounded-full border border-gray-800 bg-gray-950 px-3 py-1.5 font-mono">
								Wallet {shortAddress(data.agent.wallet)}
							</span>
						{/if}
						<span class="rounded-full border border-gray-800 bg-gray-950 px-3 py-1.5">
							Created {dateFormatter.format(new Date(data.agent.createdAt))}
						</span>
					</div>

					{#if wallet.connected && isOwner}
						<p class="text-sm text-emerald-300">Connected wallet matches this agent owner.</p>
					{/if}
				</div>
			</div>

			<div class="grid min-w-full gap-4 sm:grid-cols-3 xl:min-w-[22rem] xl:grid-cols-1">
				<div class="rounded-2xl border border-gray-800 bg-gray-950/80 p-4">
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase">Total Score</p>
					<p class="mt-3 text-3xl font-semibold text-emerald-400">
						{#if data.scores?.totalScore != null}
							{scoreFormatter.format(data.scores.totalScore)}
						{:else}
							<span class="text-gray-500">Pending</span>
						{/if}
					</p>
				</div>
				<div class="rounded-2xl border border-gray-800 bg-gray-950/80 p-4">
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase">Feedback</p>
					<p class="mt-3 text-3xl font-semibold text-white">{data.scores?.feedbackCount ?? 0}</p>
				</div>
				<div class="rounded-2xl border border-gray-800 bg-gray-950/80 p-4">
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase">Validators</p>
					<p class="mt-3 text-3xl font-semibold text-white">{data.scores?.validationCount ?? 0}</p>
				</div>
			</div>
		</div>
	</section>

	<div class="flex flex-wrap gap-2">
		{#each tabs as tab (tab.id)}
			<button
				type="button"
				onclick={() => (activeTab = tab.id)}
				class={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
					activeTab === tab.id
						? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-100'
						: 'border-gray-800 bg-gray-900 text-gray-400 hover:text-white'
				}`}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	{#if activeTab === 'metadata'}
		<section class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
			<div class="rounded-[1.75rem] border border-gray-800 bg-gray-900/70 p-6">
				<h2 class="text-lg font-medium text-white">On-chain Metadata</h2>
				<p class="mt-1 text-sm text-gray-500">
					Additional key-value entries indexed for this agent.
				</p>

				{#if data.metadata.length > 0}
					<div class="mt-5 overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead class="text-left text-xs tracking-[0.16em] text-gray-500 uppercase">
								<tr>
									<th class="pb-3 font-medium">Key</th>
									<th class="pb-3 font-medium">Value</th>
								</tr>
							</thead>
							<tbody>
								{#each data.metadata as entry (entry.key)}
									<tr class="border-t border-gray-800">
										<td class="py-3 pr-4 font-mono text-xs text-indigo-200">{entry.key}</td>
										<td class="py-3 font-mono text-xs text-gray-300">{entry.value ?? ''}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div
						class="mt-5 rounded-2xl border border-dashed border-gray-800 bg-gray-950/70 px-4 py-8 text-sm text-gray-500"
					>
						No extra metadata has been indexed for this agent.
					</div>
				{/if}
			</div>

			<div class="rounded-[1.75rem] border border-gray-800 bg-gray-900/70 p-6">
				<h2 class="text-lg font-medium text-white">Registration Payload</h2>
				<p class="mt-1 text-sm text-gray-500">
					Decoded `agent_uri_data` payload stored at registration time.
				</p>

				{#if data.agent.agentUri}
					<div class="mt-5 rounded-2xl border border-gray-800 bg-gray-950/70 p-4">
						<p class="text-xs tracking-[0.16em] text-gray-500 uppercase">Agent URI</p>
						<p class="mt-2 font-mono text-xs break-all text-gray-300">{data.agent.agentUri}</p>
					</div>
				{/if}

				{#if data.agent.registrationData}
					<pre
						class="mt-5 overflow-auto rounded-2xl border border-gray-800 bg-gray-950/90 p-4 text-xs leading-6 text-gray-300">{data
							.agent.registrationData}</pre>
				{:else}
					<div
						class="mt-5 rounded-2xl border border-dashed border-gray-800 bg-gray-950/70 px-4 py-8 text-sm text-gray-500"
					>
						No structured registration payload is available.
					</div>
				{/if}
			</div>
		</section>
	{:else if activeTab === 'reputation'}
		<section class="space-y-6">
			<div class="grid gap-4 md:grid-cols-3">
				<div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase">Average Score</p>
					<p class="mt-3 text-2xl font-semibold text-white">
						{scoreFormatter.format(data.scores?.avgScore ?? 0)}
					</p>
				</div>
				<div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase">Unique Clients</p>
					<p class="mt-3 text-2xl font-semibold text-white">{data.scores?.uniqueClients ?? 0}</p>
				</div>
				<div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase">Feedback Rows</p>
					<p class="mt-3 text-2xl font-semibold text-white">{data.feedback.length}</p>
				</div>
			</div>

			{#if wallet.connected}
				<p class="text-sm text-gray-500">Feedback submission UI will be added in backlog 008.</p>
			{/if}

			<div class="overflow-hidden rounded-[1.75rem] border border-gray-800 bg-gray-900/70">
				<div class="border-b border-gray-800 px-6 py-4">
					<h2 class="text-lg font-medium text-white">Reputation Feed</h2>
					<p class="mt-1 text-sm text-gray-500">
						Latest indexed feedback entries and any recorded responses.
					</p>
				</div>

				{#if data.feedback.length > 0}
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead
								class="bg-gray-950/70 text-left text-xs tracking-[0.16em] text-gray-500 uppercase"
							>
								<tr>
									<th class="px-6 py-4 font-medium">Client</th>
									<th class="px-6 py-4 text-right font-medium">Score</th>
									<th class="px-6 py-4 font-medium">Tag</th>
									<th class="px-6 py-4 font-medium">Responses</th>
									<th class="px-6 py-4 font-medium">Status</th>
									<th class="px-6 py-4 font-medium">Date</th>
								</tr>
							</thead>
							<tbody>
								{#each data.feedback as feedback (feedback.id)}
									<tr class:opacity-50={feedback.isRevoked} class="border-t border-gray-800">
										<td class="px-6 py-4 font-mono text-xs text-gray-300">
											{shortAddress(feedback.clientAddress)}
										</td>
										<td class="px-6 py-4 text-right font-medium text-emerald-400">
											{scoreFormatter.format(feedback.score)}
										</td>
										<td class="px-6 py-4 text-gray-300">
											{#if feedback.tag1}
												<div class="flex flex-wrap gap-2">
													<span
														class="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-100"
													>
														{feedback.tag1}
													</span>
													{#if feedback.tag2}
														<span
															class="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-100"
														>
															{feedback.tag2}
														</span>
													{/if}
												</div>
											{:else}
												<span class="text-gray-600">No tags</span>
											{/if}
										</td>
										<td class="px-6 py-4 text-xs text-gray-300">
											{#if feedback.responses.length > 0}
												<div class="flex flex-wrap gap-2">
													{#each feedback.responses.slice(0, 2) as response (response.id)}
														<span
															class="rounded-full border border-gray-800 bg-gray-950 px-2 py-1 font-mono text-[11px]"
														>
															{shortAddress(response.responder)}
														</span>
													{/each}
													{#if feedback.responses.length > 2}
														<span
															class="rounded-full border border-gray-800 bg-gray-950 px-2 py-1 text-[11px] text-gray-500"
														>
															+{feedback.responses.length - 2}
														</span>
													{/if}
												</div>
											{:else}
												<span class="text-gray-600">None</span>
											{/if}
										</td>
										<td class="px-6 py-4 text-xs">
											{#if feedback.isRevoked}
												<span
													class="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 text-red-300"
												>
													Revoked
												</span>
											{:else}
												<span
													class="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-300"
												>
													Active
												</span>
											{/if}
										</td>
										<td class="px-6 py-4 text-xs text-gray-500">
											{dateTimeFormatter.format(new Date(feedback.createdAt))}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="px-6 py-10 text-sm text-gray-500">
						No reputation entries have been indexed yet.
					</div>
				{/if}
			</div>
		</section>
	{:else}
		<section class="space-y-6">
			<div class="grid gap-4 md:grid-cols-2">
				<div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase">Validation Requests</p>
					<p class="mt-3 text-2xl font-semibold text-white">{data.validations.length}</p>
				</div>
				<div class="rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
					<p class="text-xs tracking-[0.16em] text-gray-500 uppercase">Average Validation</p>
					<p class="mt-3 text-2xl font-semibold text-white">
						{scoreFormatter.format(data.scores?.avgValidationScore ?? 0)}
					</p>
				</div>
			</div>

			{#if wallet.connected && isOwner}
				<p class="text-sm text-gray-500">Validation request UI will be added in backlog 008.</p>
			{/if}

			<div class="overflow-hidden rounded-[1.75rem] border border-gray-800 bg-gray-900/70">
				<div class="border-b border-gray-800 px-6 py-4">
					<h2 class="text-lg font-medium text-white">Validation Requests</h2>
					<p class="mt-1 text-sm text-gray-500">
						Indexed validator requests and responses for this agent.
					</p>
				</div>

				{#if data.validations.length > 0}
					<div class="overflow-x-auto">
						<table class="min-w-full text-sm">
							<thead
								class="bg-gray-950/70 text-left text-xs tracking-[0.16em] text-gray-500 uppercase"
							>
								<tr>
									<th class="px-6 py-4 font-medium">Validator</th>
									<th class="px-6 py-4 font-medium">Tag</th>
									<th class="px-6 py-4 text-right font-medium">Score</th>
									<th class="px-6 py-4 font-medium">Status</th>
									<th class="px-6 py-4 font-medium">Requested</th>
									<th class="px-6 py-4 font-medium">Responded</th>
								</tr>
							</thead>
							<tbody>
								{#each data.validations as validation (`${validation.validatorAddress}:${validation.createdAt}`)}
									<tr class="border-t border-gray-800">
										<td class="px-6 py-4 font-mono text-xs text-gray-300">
											{shortAddress(validation.validatorAddress)}
										</td>
										<td class="px-6 py-4 text-gray-300">
											{#if validation.tag}
												<span
													class="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-1 text-xs text-indigo-100"
												>
													{validation.tag}
												</span>
											{:else}
												<span class="text-gray-600">No tag</span>
											{/if}
										</td>
										<td class="px-6 py-4 text-right font-medium">
											{#if validation.hasResponse && validation.score != null}
												<span class="text-emerald-400">
													{scoreFormatter.format(validation.score)} / 100
												</span>
											{:else}
												<span class="text-gray-600">Pending</span>
											{/if}
										</td>
										<td class="px-6 py-4 text-xs">
											{#if validation.hasResponse}
												<span
													class="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-emerald-300"
												>
													Responded
												</span>
											{:else}
												<span
													class="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-yellow-300"
												>
													Pending
												</span>
											{/if}
										</td>
										<td class="px-6 py-4 text-xs text-gray-500">
											{dateTimeFormatter.format(new Date(validation.createdAt))}
										</td>
										<td class="px-6 py-4 text-xs text-gray-500">
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
					<div class="px-6 py-10 text-sm text-gray-500">
						No validation requests have been indexed yet.
					</div>
				{/if}
			</div>
		</section>
	{/if}
</div>
