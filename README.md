# Trustless Agents on Stellar/Soroban

[8004 standard](https://www.8004.org) implementation on Stellar/Soroban - agent discovery, identity, and reputation.

## Contracts

| Contract | Testnet | Mainnet |
|----------|---------|---------|
| Identity Registry | [`CDE3K4CO...7FIWZH`](https://stellar.expert/explorer/testnet/contract/CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH) | [`CBGPDCJI...GMCL6X35`](https://stellar.expert/explorer/public/contract/CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35) |
| Reputation Registry | [`CBZEAGIE...GZ7HT55`](https://stellar.expert/explorer/testnet/contract/CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55) | [`CBOIAIMM...MXSTEPPA`](https://stellar.expert/explorer/public/contract/CBOIAIMMWAXI57OATLX6BWVDQLCC4YU55HV6MZXFRP6CBSGAMXSTEPPA) |
| Validation Registry | [`CC5USZRO...KLMO3SL`](https://stellar.expert/explorer/testnet/contract/CC5USZRO26MOIAVNYTTJDS63C2OBBLREOAOET4CPF2EZWO3YFKLMO3SL) | [`CBT6WWEV...MWUO7UJG`](https://stellar.expert/explorer/public/contract/CBT6WWEVEPT2UFGFGVJJ7ELYGLQAGRYSVGDTGMCJTRWXOH27MWUO7UJG) |

Single source of truth for addresses: [`webapp/packages/sdk/src/core/config.ts`](webapp/packages/sdk/src/core/config.ts).

## Structure

```
contracts/
  identity-registry/    - Agent NFTs, metadata, wallet binding
  reputation-registry/  - Feedback, self-feedback prevention, WAD averaging
  validation-registry/  - Third-party attestation requests/responses
webapp/
  apps/web/             - SvelteKit frontend (stellar8004.com)
  packages/sdk/         - @trionlabs/8004-sdk
  packages/indexer/     - Soroban event indexer
  supabase/             - Migrations, edge functions, schema
```

## Build and Test

```bash
cargo install stellar-cli
make build    # Build all contracts
make test     # 74 tests
make fmt
```

## Deploy

```bash
stellar keys generate deployer --network testnet --fund
DEPLOYER=$(stellar keys address deployer)

stellar contract deploy \
  --wasm target/wasm32v1-none/release/identity_registry.wasm \
  --source-account deployer --network testnet \
  -- --owner $DEPLOYER --name '"Agent Registry"' --symbol '"AGENT"'

stellar contract deploy \
  --wasm target/wasm32v1-none/release/reputation_registry.wasm \
  --source-account deployer --network testnet \
  -- --owner $DEPLOYER --identity_registry <IDENTITY_CONTRACT_ID>

stellar contract deploy \
  --wasm target/wasm32v1-none/release/validation_registry.wasm \
  --source-account deployer --network testnet \
  -- --owner $DEPLOYER --identity_registry <IDENTITY_CONTRACT_ID>
```

### After redeploying

Update these files with new addresses:

1. `webapp/packages/sdk/src/core/config.ts` - addresses + `deployLedger`
2. `webapp/packages/sdk/src/bindings/{identity,reputation,validation}.ts` - `networks.testnet.contractId`
3. `webapp/packages/sdk/tests/config.test.ts` - assertions
4. `webapp/apps/web/.env.example`
5. This README

Then run `scripts/backfill-events.ts` from the new deploy ledger and redeploy the indexer.

## Webapp

See [`webapp/README.md`](webapp/README.md) for the explorer, SDK quick start, and local dev setup.

## Agent Identifier

`stellar:{network}:{identityRegistryAddress}#{agentId}`

Example: `stellar:testnet:CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH#0`

## Technical Details

Spec coverage, EVM divergences, event layouts, and type mappings: [`TECHNICAL.md`](TECHNICAL.md).

## Dependencies

- `soroban-sdk` 25.3.0
- OpenZeppelin Stellar Contracts (pinned to commit `9dd85c30`)
- `stellar-cli` 25.2.0
- Rust nightly pinned in `rust-toolchain.toml`

## References

- [8004 Standard](https://www.8004.org)
- [EIP-8004 Spec](https://eips.ethereum.org/EIPS/eip-8004)
- [8004 Reference Contracts](https://github.com/erc-8004/erc-8004-contracts)
- [8004 Network Registry](https://8004scan.io/networks)

## License

MIT
