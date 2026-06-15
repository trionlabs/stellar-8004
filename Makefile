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

# Verify the freshly built WASMs match the published reproducible-build digests
# (contracts/wasm.sha256). Run in CI so a toolchain/dep/profile drift that
# changes the bytes fails the build instead of silently shipping new binaries.
verify-wasm: build
	sha256sum -c contracts/wasm.sha256

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
