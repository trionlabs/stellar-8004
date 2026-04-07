// Contract bindings (from trionlabs8004)
export {
	IdentityClient,
	ReputationClient,
	ValidationClient,
} from './bindings/index.js';
export type {
	MetadataEntry,
	FeedbackData,
	SummaryResult,
	ValidationStatus,
	ValidationSummary,
} from './bindings/index.js';

// Client factory
export { createClients } from './core/clients.js';
export type { ClientSet, SignerOptions } from './core/clients.js';

// Config
export { TESTNET_CONFIG, MAINNET_CONFIG, getConfig } from './core/config.js';
export type { StellarConfig } from './core/config.js';

// Metadata & URI validation
export {
	buildMetadataJson,
	buildMetadataJsonForEdit,
	downloadMetadataJson,
	getMetadataSize,
	toDataUri,
	validateUrl,
	validateAgentUri,
	validateMetadataJson,
	SAFE_URI_SCHEMES,
} from './core/metadata.js';

// Helpers
export { estimateGas, fundTestnet, generateRequestNonce, validateTag, MAX_TAG_LENGTH } from './core/helpers.js';

// Types
export type { AgentFormData, ServiceEntry } from './core/types.js';

// API
export {
	ApiError,
	ExplorerClient,
	NotFoundError,
	RateLimitError,
	ValidationError,
} from './api/explorer.js';
export type {
	AgentResponse,
	ApiMeta,
	ApiResponse,
	FeedbackReplyResponse,
	FeedbackResponse,
	HealthResponse,
	PaginationMeta,
	StatsResponse,
} from './api/explorer.js';

// Signers
export { wrapBasicSigner } from './signers/basic.js';
export { FreighterSigner, withTimeout } from './signers/freighter.js';
export type {
	SignAuthEntry,
	SignTransaction,
	WalletError,
	WalletSigner,
} from './signers/interface.js';

// Storage
export { AutoStorage } from './storage/auto.js';
export { DataUriStorage } from './storage/data-uri.js';
export type { StorageUploader } from './storage/interface.js';
export { PinataStorage } from './storage/pinata.js';
