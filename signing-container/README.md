# Mehmet IPA signing engine — isolated prototype

This directory is a **prototype**, not an active signing service. It does not
change the existing Pages deployment, D1 database, R2 vault or member UI.

It builds zsign into a Linux container and accepts IPA/P12/mobileprovision
multipart inputs from a **trusted server-side caller**. Never expose /sign
directly to the public internet. A Cloudflare Worker must authenticate users,
authorize their jobs, retrieve and decrypt credentials from the private vault,
and forward them to the container via its private binding.

Remaining before production:
1. Verify the zsign build, command-line flags, and successful test signature.
2. Deploy an isolated Cloudflare Container with a Durable Object Worker binding.
3. Implement authenticated upload to private R2, encrypted certificate access,
   job ownership, expiry and cleanup.
4. Connect the member UI to job status and one-time signed IPA downloads.
5. Run end-to-end testing with a legitimate P12, matching provisioning profile,
   and a small IPA. Do not report success until verified.

Security: temporary files are deleted after each request; error responses never
include subprocess output. Avoid concurrent workers until isolation is verified.
