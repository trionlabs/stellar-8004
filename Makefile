default: build

all: test

# Identity must build first (reputation and validation import its WASM)
build:
	stellar contract build --package identity-registry
	stellar contract build --package reputation-registry
	stellar contract build --package validation-registry
	@ls -l target/wasm32v1-none/release/*.wasm

build-identity:
	stellar contract build --package identity-registry

build-reputation: build-identity
	stellar contract build --package reputation-registry

build-validation: build-identity
	stellar contract build --package validation-registry

test:
	cargo test --workspace

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
