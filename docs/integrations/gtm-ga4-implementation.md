# NDBF GTM + GA4 Implementation Record

This record contains configuration identifiers and verification evidence only. It must
not contain secrets, cookies, login information, or applicant data.

## 1. Initial state

- [x] Audit started from branch `release/url-prefill-2026-07-23`.
- [x] Worktree was clean before implementation.
- [x] Production Vercel deployment was on `main` commit `bf0e7c2`.
- [x] Release-branch preview was on commit `8eca75c`.
- [x] No GTM, GA4, `gtag`, or `dataLayer` implementation existed in application source.
- [x] Vercel Speed Insights was the only existing frontend analytics integration.

## 2. GA4 resources

- [x] Account: `Next Day Business Funding`
- [x] Account ID: `402250979`
- [x] Property: `Next Day Business Funding - Web`
- [x] Property ID: `547002090`
- [x] Timezone: `America/New_York`
- [x] Currency: `USD`
- [x] Web stream: `NDBF Web Journey`
- [x] Stream ID: `15314431011`
- [x] Measurement ID: `G-BSXPQ0QP2B`
- [x] Event-data retention set to 14 months.
- [x] Enhanced measurement configured with page views, scrolls, and outbound clicks
  enabled; site search, form interactions, video engagement, and file downloads disabled.
- [x] Email redaction enabled and query-parameter redaction configured for
  `first_name`, `last_name`, `full_name`, `email`, `phone`,
  `business_legal_name`, `prefill`, `contact_id`, `recipient_id`, `message_id`,
  `application_id`, and `entry_id`.
- [x] Google tag ID: `GT-TX9CMG82`
- [x] Google Signals, user-provided data, advertising personalization, and
  advertising tags were not enabled.

## 3. GTM resources

- [x] Account: `Next Day Business Funding`
- [x] Account ID: `6367752052`
- [x] Container: `NDBF Web`
- [x] Container ID: `GTM-N9WZSDXR` (internal container ID `259254219`)
- [x] `Google Tag - NDBF GA4` configured with current Google tag ID
  `GT-TX9CMG82` on `Initialization - All Pages`; its connected GA4 destination
  is measurement ID `G-BSXPQ0QP2B`.
- [x] Built-in `Event` variable enabled.
- [x] Data Layer Variables created for `app_param`, all seven approved UTM
  reporting fields, `attribution_origin`, `step_number`, `step_name`, and
  `error_category`.
- [x] `Custom Event - NDBF Application Events` created with the required
  event-name regular expression.
- [x] `GA4 Event - NDBF Application Events` created with event name
  `{{Event}}` and all required Data Layer Variable mappings.
- [x] Container published after Tag Assistant verification.

## 4. Domains and cross-domain settings

- [x] On 2026-07-24 the owner narrowed the implementation scope to the Vercel
  application only.
- [x] No GTM or GA4 installation is required on the WordPress homepage.
- [x] No homepage-event or `_gl` cross-domain verification is required.
- [x] Existing GA4 cross-domain entries for `nextdaybizfunding.com` and
  `ndbf-application.vercel.app` remain configured but do not cause the untagged
  homepage to collect analytics.
- [x] `links.email.nextdaybizfunding.com` is configured as an unwanted referral.

## 5. Attribution contract

- [x] `app`, `utm_id`, `utm_source`, `utm_medium`, `utm_campaign`,
  `utm_content`, `utm_term`, and `utm_source_platform` are supported.
- [x] Safe attribution persists for 30 days in `ndbf-attribution-v1`.
- [x] Explicit URL values merge without nulling missing stored values.
- [x] Bare URLs restore non-expired attribution.
- [x] Malformed and expired storage is discarded.
- [x] PII-prefill fields never enter attribution storage.
- [x] Existing submission attribution fields remain backward compatible.
- [x] `attribution_origin` is restricted to `url`, `stored`, or `none`.

## 6. Event contract

- [x] `application_landing`
- [x] `application_start`
- [x] `application_step_view`
- [x] `application_step_complete`
- [x] `application_validation_error`
- [x] `homepage_link_click` is emitted only by the application logo link; no
  homepage code is tagged.
- [x] `application_resume`
- [x] `application_submit_attempt`
- [x] `application_submit_error`
- [x] `generate_lead` (emitted only by successful-response processing)

## 7. Custom dimensions

- [x] `app_param`
- [x] `attribution_utm_id`
- [x] `attribution_utm_source`
- [x] `attribution_utm_medium`
- [x] `attribution_utm_campaign`
- [x] `attribution_utm_content`
- [x] `attribution_utm_term`
- [x] `attribution_utm_source_platform`
- [x] `attribution_origin`
- [x] `step_number`
- [x] `step_name`
- [x] `error_category`
- [ ] `generate_lead` registered as a key event.
- [ ] `Application Funnel` exploration shell created; the exact funnel remains
  incomplete because newly registered `step_name` is not yet available to the
  Explore filter builder.

## 8. Application files changed

- [x] `src/lib/attribution.ts`
- [x] `src/lib/attribution.test.ts`
- [x] `src/lib/analytics.ts`
- [x] `src/lib/analytics.test.ts`
- [x] `src/App.tsx`
- [x] `src/components/Layout.tsx`
- [x] `src/steps/ContactInfo.tsx`
- [x] `src/steps/BusinessInfo.tsx`
- [x] `src/steps/OwnershipDetails.tsx`
- [x] `src/steps/BankStatements.tsx`
- [x] `src/steps/SignSubmit.tsx`
- [x] `src/lib/prefill.ts`
- [x] `src/lib/prefill.test.ts`
- [x] `README.md`

## 9. GTM published version

- [x] Initial version name: `Initial GA4 and application funnel`
- [x] Live version name: `Final application event readiness`
- [x] Version number: `5`
- [x] Publication time: `2026-07-24 America/New_York`
- [x] Prior version for rollback: Version 2 contains the original measurement-ID
  configuration; Version 1 is the `Empty Container` baseline.

## 10. Git commit

- [x] Primary commit: `adb7200cd8719ece132f2e719d827c91b5dd2e82`
  (`feat: add privacy-safe GTM and GA4 analytics`)
- [x] Final deployed commit: `2dcf023415030118bd7c7acdcd12c2f99d9433ba`
- [x] Remote branch: `origin/release/url-prefill-2026-07-23`

## 11. Vercel preview and production deployments

- [x] Final corrected preview deployment ID:
  `dpl_5rTBmsH7Mx7XYpDnTUpMsQyKLezN`
- [x] Preview URL:
  `https://ndbf-application-2m17vrnru-vincent-vitolos-projects.vercel.app`
- [x] Production deployment ID:
  `dpl_88XzCr7FSGwt8bUEiewGPEpCYdcV`
- [x] Production deployment URL:
  `https://ndbf-application-mm0pgj4tr-vincent-vitolos-projects.vercel.app`
- [x] Canonical URL verified: `https://ndbf-application.vercel.app`
- [x] Prior production rollback deployment:
  `dpl_9n31SDb4KX5SSz5yyAQqs8BfND7p`

## 12. Verification checklist

- [x] Fresh `npm test` passes: 15/15 tests on 2026-07-24 after the final
  `application_resume` correction.
- [x] Fresh `npm run build` passes on 2026-07-24 (Vite emitted only its existing
  large-chunk advisory).
- [x] Synthetic prefill values populate and remain editable in local and preview builds.
- [x] PII query parameters disappear before the GTM script is present; Tag Assistant's
  landing `Page URL` contains approved attribution and `gtm_debug` only.
- [x] Tag Assistant records one landing and one initial step-view event without
  an initial `application_resume`.
- [x] Tag Assistant records step completion and the following step view only after
  the application advances.
- [x] Validation event code and controlled categories were reviewed; no form values
  or validation messages are included.
- [x] Tag Assistant recorded `application_resume` only after the application had
  first become hidden.
- [x] A bare application URL restored the safe campaign with
  `attribution_origin="stored"` in Tag Assistant.
- [x] Explicit campaign URL updates matching fields in unit tests.
- [x] Expired and malformed storage is ignored by unit tests.
- [x] Loader and one-time start behavior are idempotent in unit tests.
- [x] Dynamic loader queues GTM's required `gtm.start` / `gtm.js` bootstrap,
  inserts the script only after URL sanitation, and emits the one-time landing
  plus any immediately queued events after GTM's load signal so GA4 is ready.
- [x] Tag Assistant shows `Google Tag - NDBF GA4` succeeding on Initialization
  before the application GA4 event tag fires.
- [x] The published container loads `gtag.js` for Google tag `GT-TX9CMG82`,
  whose connected destination is `G-BSXPQ0QP2B`.
- [ ] GA4 DebugView reports zero debug devices even though Tag Assistant shows
  both GA4 tags succeeding.
- [ ] GA4 Realtime reports zero users/events and the web stream reports no data
  received.
- [x] Homepage Realtime verification is not applicable to the application-only scope.
- [x] No production application was submitted for analytics testing.
- [x] `generate_lead` mocked-success unit test passes.
- [x] Synthetic `generate_lead` was pushed through the published GTM container
  without submitting an application; the GA collection endpoint returned 204.
- [x] Canonical production page views and application-event batches reached
  `www.google-analytics.com/g/collect` for `G-BSXPQ0QP2B` with HTTP 204.

## 13. Privacy verification

- [x] Tag Assistant's first landing Page URL contains no PII-prefill parameters.
- [x] Tag Assistant's landing data layer contains only approved attribution fields;
  `utm_term`, step fields, and `error_category` remain undefined when not applicable.
- [x] Attribution storage shape is restricted to approved safe fields by unit tests.
- [x] Analytics event construction accepts only safe attribution and controlled
  event parameters.
- [x] No name, email, phone, business name, contact ID, recipient ID, message ID,
  entry ID, application ID, or prefill token appeared in the sanitized page URL,
  GTM variables, or Tag Assistant application-event payloads.
- [x] Only directive-provided synthetic `.invalid` applicant data was used.

## 14. Blockers or incomplete work

- [x] `CHANGELOG-LOCAL`: The owner designated the root local `CHANGELOG.md` as
  the only changelog source of truth. No vector-store synchronization is required,
  and unavailable vector-store access is not a blocker.
- [x] `BLOCKED-HOMEPAGE-TAG` is closed as not applicable after the owner narrowed
  scope to the Vercel application only.
- [ ] `GA4-UI-PROPAGATION`: Canonical production requests are accepted by the
  GA4 collection endpoint (HTTP 204), but Realtime, DebugView, Recent events,
  and stream status still show no processed data in the newly created property.
  Google-side processing must expose the received events before the UI can be
  used to star `generate_lead` or complete event-filtered funnel steps.
- [ ] `GA4-PROPAGATION`: Because GA4 has no received events, `generate_lead`
  cannot yet be starred as a key event and the exact funnel filters cannot be
  completed.

## 15. Rollback information

- [x] GTM rollback baseline: Version 1, `Empty Container`; Version 2 retains the
  initial application analytics configuration if the tag-ID correction must be
  reversed.
- [x] Vercel rollback baseline: prior production deployment
  `dpl_9n31SDb4KX5SSz5yyAQqs8BfND7p` remains available.
- [x] Application rollback baseline: current production remains on `main` commit
  `bf0e7c2`.
