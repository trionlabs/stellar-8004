import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { requireEnv } from './env.js';
import { log } from './logger.js';
import type { IdentityEvent } from './parsers/identity.js';
import type { ReputationEvent } from './parsers/reputation.js';
import type { ValidationEvent } from './parsers/validation.js';

type SupabaseResult = {
  error: { message: string } | null;
};

const utf8Decoder = new TextDecoder('utf-8', { fatal: false });

function assertNoError(result: SupabaseResult, context: string): void {
  if (result.error) {
    throw new Error(`${context}: ${result.error.message}`);
  }
}

function toDbBigint(value: bigint): string {
  return value.toString();
}

function logMalformedEvent(
  contract: 'identity' | 'reputation' | 'validation',
  eventType: string,
  payload: unknown,
): void {
  log({
    level: 'error',
    msg: 'Malformed event payload',
    contract,
    event: eventType,
    payload,
  });
}

export function createSupabaseAdmin(): SupabaseClient {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  );
}

export async function getLastLedger(
  db: SupabaseClient,
  contractName: string,
): Promise<number> {
  const result = await db
    .from('indexer_state')
    .select('last_ledger')
    .eq('id', contractName)
    .maybeSingle();

  assertNoError(result, `[indexer_state] failed to read checkpoint for ${contractName}`);

  return Number(result.data?.last_ledger ?? 0);
}

export async function getExpectedNextLedger(
  db: SupabaseClient,
  contractName: string,
): Promise<number | null> {
  const result = await db
    .from('indexer_state')
    .select('expected_next_ledger')
    .eq('id', contractName)
    .maybeSingle();

  assertNoError(result, `[indexer_state] failed to read expected_next_ledger for ${contractName}`);

  const val = result.data?.expected_next_ledger;
  return val != null ? Number(val) : null;
}

export async function updateCheckpoint(
  db: SupabaseClient,
  contractName: string,
  ledger: number,
  cursor?: string,
  expectedNextLedger?: number,
): Promise<void> {
  const result = await db.from('indexer_state').upsert({
    id: contractName,
    last_ledger: ledger,
    last_cursor: cursor ?? null,
    expected_next_ledger: expectedNextLedger ?? null,
    updated_at: new Date().toISOString(),
  });

  assertNoError(result, `[indexer_state] failed to update checkpoint for ${contractName}`);
}

export async function writeIdentityEvent(
  db: SupabaseClient,
  event: IdentityEvent,
): Promise<void> {
  switch (event.type) {
    case 'Registered': {
      if (event.agentId == null || !event.owner) {
        logMalformedEvent('identity', 'Registered', event);
        return;
      }

      const shouldResolveUri =
        typeof event.agentUri === 'string' && event.agentUri.length > 0;
      const result = await db.from('agents').upsert(
        {
          id: event.agentId,
          owner: event.owner,
          agent_uri: event.agentUri,
          agent_uri_data: null,
          uri_resolve_attempts: 0,
          resolve_uri_pending: shouldResolveUri,
          created_at: event.ledgerClosedAt,
          created_ledger: event.ledger,
          tx_hash: event.txHash,
        },
        { onConflict: 'id' },
      );

      assertNoError(result, `[identity] failed to upsert Registered agent ${event.agentId}`);
      break;
    }

    case 'UriUpdated': {
      if (event.agentId == null || !event.newUri) {
        logMalformedEvent('identity', 'UriUpdated', event);
        return;
      }

      const result = await db
        .from('agents')
        .update({
          agent_uri: event.newUri,
          agent_uri_data: null,
          supported_trust: [],
          services: [],
          uri_resolve_attempts: 0,
          resolve_uri_pending: true,
        })
        .eq('id', event.agentId);

      assertNoError(result, `[identity] failed to update URI for agent ${event.agentId}`);
      break;
    }

    case 'MetadataSet': {
      if (event.agentId == null || !event.key) {
        logMalformedEvent('identity', 'MetadataSet', event);
        return;
      }

      const value =
        typeof event.value === 'string'
          ? event.value
          : utf8Decoder.decode(event.value);

      const result = await db.from('agent_metadata').upsert(
        {
          agent_id: event.agentId,
          key: event.key,
          value,
        },
        { onConflict: 'agent_id,key' },
      );

      assertNoError(
        result,
        `[identity] failed to upsert metadata ${event.key} for agent ${event.agentId}`,
      );
      break;
    }

    case 'WalletSet': {
      if (event.agentId == null || !event.wallet) {
        logMalformedEvent('identity', 'WalletSet', event);
        return;
      }

      const result = await db
        .from('agents')
        .update({ wallet: event.wallet })
        .eq('id', event.agentId);

      assertNoError(result, `[identity] failed to set wallet for agent ${event.agentId}`);
      break;
    }

    case 'WalletRemoved': {
      if (event.agentId == null) {
        logMalformedEvent('identity', 'WalletRemoved', event);
        return;
      }

      const result = await db
        .from('agents')
        .update({ wallet: null })
        .eq('id', event.agentId);

      assertNoError(result, `[identity] failed to clear wallet for agent ${event.agentId}`);
      break;
    }
  }
}

export async function writeReputationEvent(
  db: SupabaseClient,
  event: ReputationEvent,
): Promise<void> {
  switch (event.type) {
    case 'NewFeedback': {
      if (event.agentId == null || !event.clientAddress) {
        logMalformedEvent('reputation', 'NewFeedback', event);
        return;
      }

      const result = await db.from('feedback').upsert(
        {
          agent_id: event.agentId,
          client_address: event.clientAddress,
          feedback_index: toDbBigint(event.feedbackIndex),
          value: event.value.toString(),
          value_decimals: event.valueDecimals,
          tag1: event.tag1 || null,
          tag2: event.tag2 || null,
          endpoint: event.endpoint || null,
          feedback_uri: event.feedbackUri || null,
          feedback_hash: event.feedbackHash || null,
          created_at: event.ledgerClosedAt,
          created_ledger: event.ledger,
          tx_hash: event.txHash,
        },
        { onConflict: 'agent_id,client_address,feedback_index' },
      );

      assertNoError(
        result,
        `[reputation] failed to upsert feedback ${event.agentId}:${event.clientAddress}:${event.feedbackIndex}`,
      );
      break;
    }

    case 'FeedbackRevoked': {
      if (event.agentId == null || !event.clientAddress) {
        logMalformedEvent('reputation', 'FeedbackRevoked', event);
        return;
      }

      const result = await db
        .from('feedback')
        .update({ is_revoked: true })
        .eq('agent_id', event.agentId)
        .eq('client_address', event.clientAddress)
        .eq('feedback_index', toDbBigint(event.feedbackIndex));

      assertNoError(
        result,
        `[reputation] failed to revoke feedback ${event.agentId}:${event.clientAddress}:${event.feedbackIndex}`,
      );
      break;
    }

    case 'ResponseAppended': {
      if (
        event.agentId == null ||
        !event.clientAddress ||
        !event.responder
      ) {
        logMalformedEvent('reputation', 'ResponseAppended', event);
        return;
      }

      const result = await db.rpc('insert_feedback_response', {
        p_agent_id: event.agentId,
        p_client_address: event.clientAddress,
        p_feedback_index: toDbBigint(event.feedbackIndex),
        p_responder: event.responder,
        p_response_uri: event.responseUri || null,
        p_response_hash: event.responseHash || null,
        p_created_at: event.ledgerClosedAt,
        p_tx_hash: event.txHash,
      });

      assertNoError(
        result,
        `[reputation] failed to insert response for ${event.agentId}:${event.clientAddress}:${event.feedbackIndex}`,
      );
      break;
    }
  }
}

export async function writeValidationEvent(
  db: SupabaseClient,
  event: ValidationEvent,
): Promise<void> {
  switch (event.type) {
    case 'ValidationRequested': {
      if (!event.requestHash || event.agentId == null || !event.validatorAddress) {
        logMalformedEvent('validation', 'ValidationRequested', event);
        return;
      }

      const result = await db.from('validations').upsert(
        {
          request_hash: event.requestHash,
          agent_id: event.agentId,
          validator_address: event.validatorAddress,
          request_uri: event.requestUri || null,
          created_at: event.ledgerClosedAt,
          request_tx_hash: event.txHash,
        },
        { onConflict: 'request_hash' },
      );

      assertNoError(
        result,
        `[validation] failed to upsert request ${event.requestHash}`,
      );
      break;
    }

    case 'ValidationResponded': {
      if (!event.requestHash || event.response == null) {
        logMalformedEvent('validation', 'ValidationResponded', event);
        return;
      }

      const result = await db
        .from('validations')
        .update({
          response: event.response,
          response_uri: event.responseUri || null,
          response_hash: event.responseHash || null,
          tag: event.tag || null,
          has_response: true,
          responded_at: event.ledgerClosedAt,
          response_tx_hash: event.txHash,
        })
        .eq('request_hash', event.requestHash);

      assertNoError(
        result,
        `[validation] failed to update response ${event.requestHash}`,
      );
      break;
    }
  }
}

export async function refreshLeaderboard(db: SupabaseClient): Promise<void> {
  const result = await db.rpc('refresh_leaderboard');
  assertNoError(result, '[leaderboard] failed to refresh materialized view');
}
