# Mehmet IPA signing service

Separate Cloudflare Worker + Container deployment for VIP server-side IPA signing.

- The Worker accepts only authenticated `POST /sign` requests.
- The container runs zsign v1.1.2 and uses isolated temporary directories per signing job.
- IPA, P12 and provisioning-profile uploads are capped at 100 MB per request.
- Container outbound networking is disabled.
- The P12 password and certificate are not written to logs.
- Configure the Worker secret `SERVICE_TOKEN` before deploying.
- The Pages API must call this Worker only after validating the member session and VIP entitlement. Never expose the service token in browser code.

The current Ad Hoc provisioning profile must include every member device UDID that is allowed to install the signed app. Its bundle identifier must also match the app being signed.
