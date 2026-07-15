# UOMP Reference Implementation Documentation

This directory contains design and implementation documents for the UOMP reference implementation (`uomp-mvp`).

For the protocol specification, see the [UOMP website/spec](https://www.uomp.org/spec/).

## Documents

| Document | 中文 | English |
|----------|------|---------|
| CLI/SDK Design | [`cli-sdk-design.md`](./cli-sdk-design.md) | [`cli-sdk-design.en.md`](./cli-sdk-design.en.md) |
| SDK Design (API & Architecture) | [`sdk-design.md`](./sdk-design.md) | [`sdk-design.en.md`](./sdk-design.en.md) |
| Remote Authorization Design | [`remote-authorization-design.md`](./remote-authorization-design.md) | [`remote-authorization-design.en.md`](./remote-authorization-design.en.md) |

- **CLI/SDK Design**: Using the stock analyst Agent as the primary acceptance example.
- **SDK Design (API & Architecture)**: Complete API reference, architecture, integration patterns, and implementation roadmap for `@uomp/sdk`.
- **Remote Authorization Design**: Gateway, token refresh, payload encryption, DIDComm migration, and on-chain audit anchoring. **Phase 1 (Gateway + mTLS) is implemented in `apps/gateway`**.
