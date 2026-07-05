# 14 — File Storage & Media Pipeline

## 1. S3 Bucket Layout

| Bucket | Contents | Access |
|---|---|---|
| `replaycoach-recordings-raw` | Live Egress segments (per session, per track), during and immediately after a session | Private, server-side access only (Egress writes, API reads for manifest generation) |
| `replaycoach-recordings-final` | Finalized per-participant + composite recordings post-processing | Private, signed-URL access via CloudFront |
| `replaycoach-clips` | Saved, shareable Clips | Private, signed-URL access, more permissive TTL for sharing |
| `replaycoach-user-assets` | Avatars, org logos | Public-read (non-sensitive) via CloudFront |

## 2. Key Structure

```
replaycoach-recordings-raw/
  sessions/{sessionId}/participants/{participantId}/segments/{segmentIndex}.ts
  sessions/{sessionId}/composite/segments/{segmentIndex}.ts

replaycoach-recordings-final/
  sessions/{sessionId}/participants/{participantId}/full.m3u8 + segments
  sessions/{sessionId}/composite/full.m3u8 + segments

replaycoach-clips/
  clips/{clipId}/manifest.m3u8 + segments
```

## 3. Lifecycle Policies

| Rule | Action |
|---|---|
| Raw segments in `-raw` bucket | Deleted 24h after session ends (once finalized copy confirmed in `-final`) |
| Finalized recordings | S3 Standard for `retention_days` (default 90, Assumption A7), then transition to S3 Glacier Instant Retrieval, then delete after org-configured archive window |
| Clips | Retained indefinitely by default (explicitly saved by the coach as valuable content) unless the coach deletes them |
| User assets | No expiry |

Implemented via S3 Lifecycle Rules (IaC-managed, see `15_AWS_Infrastructure.md`), not application-level cron deletion — more reliable and cost-predictable.

## 4. Access Pattern — Signed URLs

- All private bucket reads go through **CloudFront signed URLs** (not direct S3 presigned URLs) so caching benefits apply and access can be centrally revoked via CloudFront key rotation if needed.
- URL TTL: 15 minutes for active replay/playback sessions (refreshed transparently by the frontend as needed), 24 hours for clip-share links (balances usability for "share with a student to watch later" against exposure window).

## 5. Encryption

- SSE-KMS on all private buckets, customer-managed key (not default AWS-managed) so key usage is auditable via CloudTrail and access can be revoked independent of IAM changes.
- TLS enforced for all S3/CloudFront access (bucket policy denies non-HTTPS requests).

## 6. Upload/Write Path

- LiveKit Egress writes directly to S3 (via IAM role, not embedded credentials) — no data transits the application backend for the raw recording write path, minimizing backend bandwidth/cost.
- Post-session finalization job (ECS task, triggered by session-end event) copies/validates raw → final bucket.

## 7. Security Considerations

- Bucket policies deny public access at the bucket level (S3 Block Public Access enabled) for all but the `-user-assets` bucket.
- IAM roles scoped narrowly: Egress role can only write to `-raw`, finalization job role can read `-raw`/write `-final`, API role can only generate signed URLs (no direct bucket read/write beyond what's needed for uploads like avatars).
- Access logging enabled on all buckets, feeding into the audit pipeline (`16_Security_Guidelines.md`, `17_Logging_Monitoring_Observability.md`).

## 8. Performance Considerations

- CloudFront caching for finalized recordings/clips (cacheable since content is immutable once finalized) — raw in-progress segments are not cached (they don't exist long enough to benefit, and correctness during a live session matters more than cache hit rate).
- Multi-part upload for any large finalized composite exports.

## 9. Common Pitfalls

- ❌ Using direct S3 presigned URLs without CloudFront — loses caching, complicates future multi-region distribution, and centralized revocation.
- ❌ Embedding long-lived AWS credentials in the Egress service instead of using IAM roles.
- ❌ Forgetting to validate the raw→final copy succeeded before deleting raw segments (data-loss risk).

## 10. Acceptance Criteria

- [ ] No S3 bucket in this system is publicly readable except `-user-assets` (verified via automated config check / AWS Config rule).
- [ ] Lifecycle transitions verified in a non-prod environment before going live.
- [ ] Signed URL expiry enforced and tested (URL rejected after TTL).
- [ ] Raw segment deletion never occurs before the finalized copy is confirmed complete.
