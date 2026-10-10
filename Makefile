default: build

all: test

# Build WASM with the local host toolchain for development.
build:
	stellar contract build --locked --package identity-registry
	stellar contract build --locked --package reputation-registry
	stellar contract build --locked --package validation-registry
	@ls -l target/wasm32v1-none/release/*.wasm

build-identity:
	stellar contract build --locked --package identity-registry

build-reputation: build-identity
	stellar contract build --locked --package reputation-registry

build-validation: build-identity
	stellar contract build --locked --package validation-registry

# Build and verify in the same pinned Linux/amd64 environment on every host.
# Verified artifacts are written to target/reproducible/.
verify-wasm:
	sh scripts/verify-wasm.sh

test:
	cargo test --workspace --locked

test-identity:
	cargo test --package identity-registry

test-reputation:
	cargo test --package reputation-registry

test-validation:
	cargo test --package validation-registry

fmt:
	cargo fmt --all

clean:
	cargo clean
