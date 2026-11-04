#!/bin/sh
# Usage: verify-wasm.sh [--update]
# --update records this build's digests in contracts/wasm.sha256 first.
set -eu

# Pin the build host as well as Rust and Stellar CLI: native hosts can assign
# different indices to internal WASM functions even with identical sources.
image='docker.io/stellar/stellar-cli:25.2.0@sha256:301ddd0f56beb84b28d8243034ed45fb6585a3ef626c28a1b572b3ecaa637bf4'
repo_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd -P)
output_dir="$repo_root/target/reproducible"
toolchain=$(sed -n 's/^channel = "\(.*\)"$/\1/p' "$repo_root/rust-toolchain.toml")
update=${1:-}

mkdir -p "$output_dir"
docker run --rm --platform linux/amd64 \
  --user "$(id -u):$(id -g)" \
  --mount "type=bind,source=$repo_root,target=/source,readonly" \
  --mount "type=bind,source=$output_dir,target=/output" \
  --env CARGO_HOME=/tmp/cargo \
  --env RUSTUP_HOME=/tmp/rustup \
  --env RUSTUP_TOOLCHAIN="$toolchain" \
  --env CARGO_INCREMENTAL=0 \
  --env UPDATE="$update" \
  --entrypoint /bin/sh "$image" -eu -c '
    rustup toolchain install "$RUSTUP_TOOLCHAIN" \
      --profile minimal --target wasm32v1-none --no-self-update
    mkdir -p /tmp/build/.cargo
    cp /source/.cargo/config.toml /tmp/build/.cargo/
    cp /source/Cargo.toml /source/Cargo.lock \
      /source/rust-toolchain.toml /tmp/build/
    cp -R /source/contracts /tmp/build/
    cd /tmp/build
    for package in identity-registry reputation-registry validation-registry; do
      stellar contract build --locked --package "$package"
    done
    if [ "$UPDATE" = --update ]; then
      sha256sum target/wasm32v1-none/release/*_registry.wasm > contracts/wasm.sha256
    fi
    sha256sum -c contracts/wasm.sha256
    cp target/wasm32v1-none/release/identity_registry.wasm \
      target/wasm32v1-none/release/reputation_registry.wasm \
      target/wasm32v1-none/release/validation_registry.wasm \
      contracts/wasm.sha256 /output/
  '

if [ "$update" = --update ]; then
  cp "$output_dir/wasm.sha256" "$repo_root/contracts/wasm.sha256"
fi
printf 'Verified WASM artifacts: %s\n' "$output_dir"
