#![no_std]

use soroban_sdk::contractmeta;
contractmeta!(key = "Description", val = "8004 Reputation Registry");
contractmeta!(key = "Version", val = "0.1.0");

pub mod contract;
pub mod errors;
pub mod events;
pub mod storage;
pub mod types;

#[cfg(test)]
mod test;
#[cfg(test)]
mod test_integration;
