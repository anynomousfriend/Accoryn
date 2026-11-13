//! Byte format of an Accoryn ceremony v1 attestation.
//!
//! Mirrors `web/src/engines/ceremony/crypto.ts`. Parts are joined with a NUL
//! byte; NEAR account IDs and decimal strings never contain NUL, so the
//! encoding is unambiguous. `tests/vectors.json` pins the exact bytes.

pub const ATTEST_DOMAIN: &str = "accoryn-ceremony-attest-v1";

pub fn attestation_message(
    gate: &str,
    dao: &str,
    proposal_id: u64,
    session_id: u64,
    receiver: &str,
    amount: u128,
    attendee: &str,
) -> Vec<u8> {
    [
        ATTEST_DOMAIN,
        gate,
        dao,
        &proposal_id.to_string(),
        &session_id.to_string(),
        receiver,
        &amount.to_string(),
        attendee,
    ]
    .join("\0")
    .into_bytes()
}
