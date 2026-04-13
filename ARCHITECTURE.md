# Stellar 8004 Architecture

This document provides a high-level overview of the `stellar-8004` project architecture, which implements the 8004 standard (Agent Discovery, Identity, and Reputation) on the Stellar/Soroban network.

## System Overview

The system is composed of three main layers:
1. **Smart Contracts (On-Chain)**: Soroban contracts managing the core 8004 standard functionality.
2. **Backend/Indexer (Off-Chain Data)**: Services to index blockchain events and serve them efficiently.
3. **Frontend & SDK (Client-Side)**: The developer SDK and user-facing web application.

```mermaid
graph TD
    subgraph Frontend Layer
        Web["SvelteKit Web App"]
        SDK["@trionlabs/stellar8004 SDK"]
        
        Web -->|Uses| SDK
    end

    subgraph Backend Layer
        Idx[Soroban Event Indexer]
        DB[(Supabase Database)]
        
        Idx -->|Stores Extracted Data| DB
    end

    subgraph Stellar Network / Soroban
        ID[Identity Registry Contract]
        REP[Reputation Registry Contract]
        VAL[Validation Registry Contract]
        
        REP -.->|Requires Agent ID| ID
        VAL -.->|Requires Agent ID| ID
    end

    SDK ==>|Submits Transactions| Stellar Network / Soroban
    SDK -.->|Reads Data| Stellar Network / Soroban
    Web -.->|Fast Queries| DB
    Idx -->|Listens to Events| Stellar Network / Soroban
```

## Layer Details

### 1. Smart Contracts
The on-chain truth. Written in Rust for the Soroban smart contract platform.

* **Identity Registry**: Serves as the base. It issues Agent NFTs, stores public metadata (up to specific limits), and binds agent wallets.
* **Reputation Registry**: Depends on the Identity Registry. Stores feedback logic (ratings, reviews) from clients to agents, enforces anti-self-feedback rules, and calculates weighted averages.
* **Validation Registry**: Depends on the Identity Registry. Facilitates third-party attestation workflows where validators can verify specific agent claims.

### 2. Backend & Data Layer
Since querying the blockchain directly for historical state can be slow, an indexing pipeline is used.

* **Soroban Event Indexer**: Listens for specific smart contract events (e.g., `Registered`, `NewFeedback`, `ValidationRequest`).
* **Supabase**: Relational database storing the parsed metadata, agent profiles, and feedback. Used to serve fast APIs and explorer views.

### 3. Frontend & SDK
Client tooling and the main user portal.

* **SDK (`packages/sdk`)**: A TypeScript library (`@trionlabs/stellar8004`) handling all interactions with the Stellar RPC, transaction building, and parsing of 8004 specific types. Single source of truth for deployed contract addresses.
* **SvelteKit Web App (`apps/web`)**: The main interface (`stellar8004.com`) used as a network explorer, showing agent profiles, validations, and a UI to interact with the registries. All fast reads use the Supabase HTTP APIs.
