#!/usr/bin/env bash
# Fetches the exact Sputnik DAO v2 contract code that sputnikv2.testnet deploys
# for new DAOs, verifies its code hash, and writes it to tests/res/ (gitignored).
# The sandbox tests run against this real code instead of a reimplementation.
set -euo pipefail

EXPECTED_HASH="AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH" # sputnikv2.testnet get_default_code_hash, DAO v2.3.1
SOURCE_ACCOUNT="${1:-accoryn-spike.sputnikv2.testnet}"
RPC="${NEAR_TESTNET_RPC:-https://rpc.testnet.fastnear.com}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$HERE/tests/res/sputnikdao2.wasm"
mkdir -p "$HERE/tests/res"

factory_hash=$(curl -fsS -X POST "$RPC" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"sputnikv2.testnet","method_name":"get_default_code_hash","args_base64":"e30="}}' |
  python3 -I -c 'import sys,json; print(json.loads(bytes(json.load(sys.stdin)["result"]["result"])))')
if [ "$factory_hash" != "$EXPECTED_HASH" ]; then
  echo "sputnikv2.testnet default code hash changed: $factory_hash (pinned $EXPECTED_HASH). Re-verify before updating the pin." >&2
  exit 1
fi

curl -fsS -X POST "$RPC" -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"query\",\"params\":{\"request_type\":\"view_code\",\"finality\":\"final\",\"account_id\":\"$SOURCE_ACCOUNT\"}}" |
  python3 -I -c '
import sys, json, base64, hashlib
expected, out = sys.argv[1], sys.argv[2]
result = json.load(sys.stdin)["result"]
code = base64.b64decode(result["code_base64"])
alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
digest = int.from_bytes(hashlib.sha256(code).digest(), "big")
encoded = ""
while digest:
    digest, rem = divmod(digest, 58)
    encoded = alphabet[rem] + encoded
rpc_hash = result["hash"]
if encoded != expected or rpc_hash != expected:
    sys.exit("code hash mismatch: computed %s, rpc %s, expected %s" % (encoded, rpc_hash, expected))
open(out, "wb").write(code)
print(f"wrote {len(code)} bytes, sha256(base58) {encoded}")
' "$EXPECTED_HASH" "$OUT"
