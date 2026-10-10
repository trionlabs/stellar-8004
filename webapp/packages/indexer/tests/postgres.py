#!/usr/bin/env python3
"""Run the real indexer migration against a private, disposable PostgreSQL cluster.
Requires local PostgreSQL 17+ binaries (PG_BINDIR may override pg_config).
Never connects to an existing database. The socket and data live in a temp dir.
"""
import json
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[3]
MIGRATIONS = ROOT / 'supabase/migrations'
BINDIR = Path(os.environ.get('PG_BINDIR') or subprocess.check_output(['pg_config', '--bindir'], text=True).strip())


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def js(value):
    return literal(json.dumps(value)) + '::jsonb'


def position(event, ledger=100):
    return f'{(ledger << 32) | (1 << 12):019d}-{event:010d}'


def packet(kind, event, **data):
    contract = ('identity' if kind in ['Registered', 'UriUpdated', 'MetadataSet', 'AgentWalletSet', 'AgentWalletUnset', 'AgentTransferred']
                else 'validation' if kind.startswith('Validation') else 'reputation')
    return dict(id=position(event), contract=contract, data=dict(type=kind, agentId=1, ledger=100,
                ledgerClosedAt='2026-10-10T00:00:00Z', txHash='a' * 64, **data))


class ProjectionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='stellar8004-pg-')
        cls.root = Path(cls.temp.name)
        cls.data = cls.root / 'data'
        cls.sock = cls.root / 'socket'
        cls.sock.mkdir()
        subprocess.run([str(BINDIR/'initdb'), '-D', str(cls.data), '-A', 'trust', '--no-locale'], check=True, capture_output=True)
        subprocess.run([str(BINDIR/'pg_ctl'), '-D', str(cls.data), '-l', str(cls.root/'pg.log'),
                        '-o', f'-k {cls.sock} -p 55439 -h ""', '-w', 'start'], check=True, capture_output=True)
        cls.addClassCleanup(cls.stop)
        cls.psql('CREATE ROLE service_role BYPASSRLS; CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA extensions;')
        # Apply real table migrations; omit unrelated cron, network extensions,
        # search/leaderboard and publication setup that need a Supabase instance.
        for n in ['001', '002', '003', '004', '005', '006', '012', '014']:
            cls.migration(n)
        cls.migration('015', 'CREATE EXTENSION')
        cls.migration('016', 'CREATE MATERIALIZED VIEW')
        cls.migration('019', 'CREATE MATERIALIZED VIEW')
        for n in ['023', '029']:
            cls.migration(n)
        cls.migration('037', 'CREATE OR REPLACE FUNCTION')
        for n in ['038', '039', '040', '041', '044', '045', '046', '047', '048']:
            cls.migration(n)
        cls.psql('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;')
        cls.migration('050')

    @classmethod
    def stop(cls):
        subprocess.run([str(BINDIR/'pg_ctl'), '-D', str(cls.data), '-m', 'fast', '-w', 'stop'], check=True, capture_output=True)
        cls.temp.cleanup()

    @classmethod
    def migration(cls, prefix, stop=None):
        sql = next(MIGRATIONS.glob(prefix + '_*.sql')).read_text()
        if stop:
            sql = sql.split(stop, 1)[0]
        cls.psql(sql)

    @classmethod
    def psql(cls, sql, error=None):
        result = subprocess.run([str(BINDIR/'psql'), '-X', '-h', str(cls.sock), '-p', '55439', '-d', 'postgres',
                                 '-Atq', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, capture_output=True)
        if error:
            assert result.returncode != 0 and error.lower() in result.stderr.lower(), result.stdout + result.stderr
        elif result.returncode:
            raise AssertionError(result.stderr)
        return result.stdout.strip()

    def setUp(self):
        self.psql('TRUNCATE agents, feedback, feedback_responses, validations, agent_metadata, indexer_streams, indexer_deployment, indexer_locks, indexer_dead_letter CASCADE; UPDATE indexer_state SET last_ledger=0, expected_next_ledger=NULL;')
        self.binding = dict(network='testnet', networkPassphrase='Test SDF Network ; September 2015',
                            contracts=dict(identity='identity', reputation='reputation', validation='validation'))
        self.revision = 0
        self.acquire('first')

    def acquire(self, owner, binding=None, kind='live', error=None):
        return self.psql(f"SET ROLE service_role; SELECT acquire_indexer_lease({literal(owner)}, {js(binding or self.binding)}, {literal(kind)});", error)

    def commit(self, events, owner='first', progress=None, error=None, gap=None):
        progress = progress or dict(lastLedger=99, startLedger=100, targetLedger=100, cursor=None)
        sql = f"SET ROLE service_role; SELECT commit_indexer_batch({literal(owner)}, {js(self.binding)}, 'live:identity', 'source', {self.revision}, {js(events)}, {js(progress)}, {js(gap)});"
        result = self.psql(sql, error)
        if not error:
            self.revision += 1
            return json.loads(result)

    def register(self):
        self.commit([packet('Registered', 1, owner='owner', agentUri='initial')])

    def test_registration_initial_claims_precede_registered_on_chain(self):
        self.commit([packet('AgentWalletSet', 1, newWallet='initial-wallet'),
                     packet('MetadataSet', 2, key='initial-key', value='initial-value'),
                     packet('Registered', 3, owner='owner', agentUri='initial')])
        self.assertEqual(self.psql('SELECT wallet FROM agents;'), 'initial-wallet')
        self.assertEqual(self.psql('SELECT value FROM agent_metadata;'), 'initial-value')
        self.commit([packet('AgentWalletSet', 1, newWallet='initial-wallet')])
        self.assertEqual(self.psql('SELECT wallet FROM agents;'), 'initial-wallet')

    def test_replayed_initialization_after_transfer_stays_cleared(self):
        initial = [packet('AgentWalletSet', 1, newWallet='initial'), packet('MetadataSet', 2, key='x', value='initial')]
        self.commit([*initial, packet('Registered', 3, owner='owner', agentUri='uri')])
        self.commit([packet('AgentTransferred', 4, to='next')])
        self.commit(initial)
        self.assertEqual(self.psql("SELECT coalesce(wallet,'empty') FROM agents;"), 'empty')
        self.assertEqual(self.psql('SELECT count(*) FROM agent_metadata;'), '0')

    def test_claim_before_registration_in_another_transaction_rejects(self):
        registration = packet('Registered', 3, owner='owner', agentUri='uri')
        registration['id'] = f'{(100 << 32) | (2 << 12):019d}-0000000003'
        self.commit([registration])
        self.commit([packet('MetadataSet', 1, key='x', value='old')], error='another transaction')

    def test_full_transaction_and_operation_order_dominates_event_suffix(self):
        self.register()
        older = packet('AgentWalletSet', 999, newWallet='older')
        newer = packet('AgentWalletSet', 0, newWallet='newer-operation')
        newer['id'] = f'{(100 << 32) | (1 << 12) | 1:019d}-0000000000'
        self.commit([newer, older])
        self.assertEqual(self.psql('SELECT wallet FROM agents;'), 'newer-operation')
        newest = packet('AgentWalletSet', 0, newWallet='newer-transaction')
        newest['id'] = f'{(100 << 32) | (2 << 12):019d}-0000000000'
        self.commit([newest, newer])
        self.assertEqual(self.psql('SELECT wallet FROM agents;'), 'newer-transaction')

    def test_backfill_cooldown_preserves_a_live_acquisition_opportunity(self):
        self.psql("SELECT release_indexer_lock('first');")
        self.assertEqual(self.acquire('history', kind='backfill'), 't')
        self.psql("SELECT release_indexer_lock('history');")
        self.assertEqual(self.acquire('history-again', kind='backfill'), 'f')
        self.assertEqual(self.acquire('live-next'), 't')
        self.psql("SELECT release_indexer_lock('history');")
        self.assertEqual(self.psql("SELECT owner FROM indexer_locks;"), 'live-next')

    def test_service_role_can_resume_but_cannot_call_legacy_helpers(self):
        self.register()
        self.assertEqual(self.psql('SET ROLE service_role; SELECT count(*) FROM indexer_streams;'), '1')
        self.psql("SET ROLE service_role; SELECT acquire_indexer_lock('old');", error='permission denied')
        self.psql("SET ROLE service_role; SELECT insert_feedback_response(1,'c',1,'r','u','h',now(),'tx','event');", error='permission denied')
        self.psql("SET ROLE service_role; SELECT apply_indexer_event('{}','{}');", error='permission denied')

    def test_lease_expiry_is_checked_after_waiting_for_the_row_lock(self):
        self.register()
        sql = "BEGIN; UPDATE indexer_locks SET acquired_at=clock_timestamp()-interval '179.7 seconds'; SELECT pg_sleep(0.7); COMMIT;"
        with ThreadPoolExecutor(max_workers=1) as pool:
            holder = pool.submit(self.psql, "SET application_name='lease-expiry-holder'; " + sql)
            self.wait_for_sleep('lease-expiry-holder')
            self.commit([packet('UriUpdated', 2, newUri='expired')], error='lease lost')
            holder.result()
        self.assertEqual(self.psql('SELECT agent_uri FROM agents;'), 'initial')

    def test_takeover_waits_for_an_already_admitted_write_to_commit(self):
        self.register()
        self.psql("""CREATE FUNCTION delay_indexer_write() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN PERFORM pg_sleep(0.7); RETURN NEW; END$$;
                     CREATE TRIGGER delay_write BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION delay_indexer_write();
                     UPDATE indexer_locks SET acquired_at=clock_timestamp()-interval '179.7 seconds';""")
        self.addCleanup(lambda: self.psql('DROP TRIGGER delay_write ON agents; DROP FUNCTION delay_indexer_write();'))
        sql = f"SET application_name='admitted-indexer'; SET ROLE service_role; SELECT commit_indexer_batch('first', {js(self.binding)}, 'live:identity', 'source', 1, {js([packet('UriUpdated',2,newUri='admitted')])}, '{{\"lastLedger\":100}}', 'null');"
        with ThreadPoolExecutor(max_workers=1) as pool:
            writer = pool.submit(self.psql, sql)
            self.wait_for_sleep('admitted-indexer')
            started = time.monotonic()
            self.assertEqual(self.acquire('second'), 't')
            self.assertGreater(time.monotonic()-started, 0.3)
            writer.result()
        self.assertEqual(self.psql('SELECT agent_uri FROM agents;'), 'admitted')
        self.assertEqual(self.psql('SELECT owner FROM indexer_locks;'), 'second')

    def wait_for_sleep(self, name):
        for _ in range(100):
            if self.psql(f"SELECT count(*) FROM pg_stat_activity WHERE application_name={literal(name)} AND wait_event='PgSleep';") == '1':
                return
            time.sleep(0.01)
        self.fail(f'{name} never reached its controlled delay')

    def test_same_ledger_replay_preserves_newer_claims_in_both_directions(self):
        self.register()
        self.commit([packet('MetadataSet', 30, key='name', value='new'), packet('AgentWalletSet', 31, newWallet='new-wallet')])
        self.commit([packet('AgentTransferred', 20, to='new-owner')])
        self.assertEqual(self.psql("SELECT owner || ':' || wallet FROM agents;"), 'new-owner:new-wallet')
        self.assertEqual(self.psql('SELECT value FROM agent_metadata;'), 'new')
        self.commit([packet('MetadataSet', 10, key='old', value='must not resurrect'), packet('AgentWalletUnset', 11)])
        self.assertEqual(self.psql('SELECT count(*) FROM agent_metadata;'), '1')
        self.commit([packet('AgentTransferred', 40, to='final-owner')])
        self.commit([packet('MetadataSet', 30, key='name', value='new'), packet('AgentWalletSet', 31, newWallet='new-wallet')])
        self.assertEqual(self.psql("SELECT owner || ':' || coalesce(wallet,'empty') FROM agents;"), 'final-owner:empty')
        self.assertEqual(self.psql('SELECT count(*) FROM agent_metadata;'), '0')

    def test_uri_equal_replay_is_inert_and_empty_uri_is_valid(self):
        self.register()
        self.commit([packet('UriUpdated', 30, newUri='new')])
        self.psql("SET ROLE service_role; UPDATE agents SET agent_uri_data='{\"name\":\"resolved\"}', x402_enabled=true, mpp_enabled=true, resolve_uri_pending=false;")
        self.commit([packet('UriUpdated', 30, newUri='new'), packet('UriUpdated', 20, newUri='old')])
        self.assertEqual(self.psql("SELECT agent_uri_data->>'name' FROM agents;"), 'resolved')
        self.commit([packet('UriUpdated', 40, newUri='')])
        self.assertEqual(self.psql("SELECT resolve_uri_pending OR x402_enabled OR mpp_enabled FROM agents;"), 'f')

    def test_missing_parent_rolls_back_events_and_progress(self):
        self.register()
        bad = packet('AgentWalletUnset', 4)
        bad['data']['agentId'] = 99
        self.commit([packet('UriUpdated', 3, newUri='uncommitted'), bad], progress=dict(lastLedger=100), error='missing prerequisite')
        self.assertEqual(self.psql('SELECT agent_uri FROM agents;'), 'initial')
        self.assertEqual(self.psql("SELECT last_ledger FROM indexer_state WHERE id='identity';"), '99')
        self.assertEqual(self.psql("SELECT revision FROM indexer_streams WHERE id='live:identity';"), '1')

    def test_expired_and_replaced_owners_cannot_mutate_or_checkpoint(self):
        self.register()
        self.psql("UPDATE indexer_locks SET acquired_at=clock_timestamp()-interval '181 seconds';")
        self.commit([packet('UriUpdated', 2, newUri='expired')], error='lease lost')
        self.assertEqual(self.acquire('second'), 't')
        self.commit([], progress=dict(lastLedger=100), error='lease lost')
        self.psql("SET ROLE service_role; SELECT release_indexer_lock('first');")
        self.commit([packet('UriUpdated', 3, newUri='current')], owner='second')
        self.assertEqual(self.psql('SELECT agent_uri FROM agents;'), 'current')

    def test_deployment_and_source_mismatches_reject_before_mutation(self):
        self.register()
        self.psql("SET ROLE service_role; SELECT release_indexer_lock('first');")
        self.acquire('second', dict(self.binding, networkPassphrase='wrong'), error='deployment mismatch')
        self.acquire('second')
        self.psql(f"SET ROLE service_role; SELECT commit_indexer_batch('second', {js(self.binding)}, 'live:identity', 'different', 1, '[]', '{{\"lastLedger\":100}}', 'null');", error='source mismatch')
        self.assertEqual(self.psql('SELECT count(*) FROM agents;'), '1')

    def test_unknown_legacy_provenance_is_preserved(self):
        self.psql("INSERT INTO agents(id, owner, agent_uri, registry_address, network) VALUES (1,'legacy-owner','legacy-uri','identity','testnet');")
        self.commit([packet('UriUpdated', 10, newUri='old')], error='legacy provenance')
        self.commit([packet('Registered', 1, owner='origin', agentUri='initial')], error='legacy provenance')
        self.assertEqual(self.psql('SELECT agent_uri FROM agents;'), 'legacy-uri')

    def test_populated_unbound_database_requires_reconciliation(self):
        self.psql("DELETE FROM indexer_deployment; DELETE FROM indexer_locks; INSERT INTO agents(id, owner) VALUES (1,'legacy');")
        self.acquire('second', error='populated')

    def test_unguarded_writers_are_blocked_but_resolver_updates_are_allowed(self):
        self.register()
        self.psql("SET ROLE service_role; UPDATE agents SET wallet='bypass' WHERE id=1;", error='permission denied')
        self.psql("SET ROLE service_role; INSERT INTO agent_metadata(agent_id,key,value) VALUES(1,'x','bypass');", error='permission denied')
        self.psql("SET ROLE service_role; SELECT apply_agent_transfer(1,'bypass',100);", error='permission denied')
        self.psql("SET ROLE service_role; UPDATE indexer_state SET last_ledger=500;", error='permission denied')
        self.psql("SET ROLE service_role; UPDATE agents SET agent_uri_data='{}', resolve_uri_pending=false, uri_resolve_attempts=1, last_resolve_attempt_at=now() WHERE id=1 AND agent_uri='initial';")

    def test_response_identity_and_surrogate_are_stable(self):
        self.register()
        feedback = packet('NewFeedback', 2, clientAddress='client', feedbackIndex='9007199254740993', value='170141183460469231731687303715884105727', valueDecimals=0)
        self.commit([feedback])
        response = dict(clientAddress='client', feedbackIndex='9007199254740993', responder='responder', responseUri='reply')
        self.commit([packet('ResponseAppended', 4, **response), packet('ResponseAppended', 3, **response)])
        self.commit([packet('ResponseAppended', 4, **response), feedback])
        self.assertEqual(self.psql('SELECT count(*) FROM feedback_responses;'), '2')
        self.assertEqual(self.psql('SELECT response_index FROM feedback_responses ORDER BY event_position;'), '2\n1')
        self.assertEqual(self.psql('SELECT value::text FROM feedback;'), feedback['data']['value'])

    def test_validation_and_revocation_missing_prerequisites_defer(self):
        self.register()
        self.commit([packet('FeedbackRevoked', 4, clientAddress='client', feedbackIndex='1')], error='missing prerequisite')
        self.commit([packet('ValidationResponse', 4, requestHash='a'*64, response=20)], error='missing prerequisite')
        self.commit([packet('ValidationRequest', 2, requestHash='a'*64, validatorAddress='validator')])
        self.commit([packet('ValidationResponse', 5, requestHash='a'*64, validatorAddress='validator', response=90), packet('ValidationResponse', 4, requestHash='a'*64, validatorAddress='validator', response=20)])
        self.assertEqual(self.psql('SELECT response FROM validations;'), '90')

    def test_failed_gap_record_and_stale_revision_cannot_advance(self):
        self.register()
        self.commit([], progress=dict(lastLedger=150), gap=dict(contract='identity', startLedger=101, endLedger=101), error='gap')
        self.psql(f"SET ROLE service_role; SELECT commit_indexer_batch('first', {js(self.binding)}, 'live:identity', 'source', 0, '[]', '{{\"lastLedger\":150}}', 'null');", error='revision')
        self.assertEqual(self.psql("SELECT last_ledger FROM indexer_state WHERE id='identity';"), '99')
        self.commit([], progress=dict(lastLedger=150), gap=dict(contract='identity', startLedger=100, endLedger=151))
        self.assertEqual(self.psql('SELECT count(*) FROM indexer_dead_letter;'), '1')


if __name__ == '__main__':
    unittest.main(verbosity=2)
