import { useEffect, useRef, useState } from "react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Layout } from "./components/Layout";
import { Stepper } from "./components/Stepper";
import { ContactInfo } from "./steps/ContactInfo";
import { BusinessInfo } from "./steps/BusinessInfo";
import { OwnershipDetails } from "./steps/OwnershipDetails";
import { BankStatements } from "./steps/BankStatements";
import { SignSubmit } from "./steps/SignSubmit";
import { Confirmation } from "./steps/Confirmation";
import { useAppStore } from "./store";
import { getUrlPrefill, removeUrlPrefillParams } from "./lib/prefill";
import {
  getUrlUnderwriting,
  hasUnderwritingValues,
  removeUrlUnderwritingParams,
} from "./lib/underwriting";
import { resolveAttribution } from "./lib/attribution";
import { analytics, type StepName } from "./lib/analytics";

const STEP_NAMES: StepName[] = [
  "contact_information",
  "business_information",
  "ownership_details",
  "bank_statements",
  "sign_and_submit",
];

export default function App() {
  const [speedInsightsReady, setSpeedInsightsReady] = useState(false);
  const currentStep = useAppStore((s) => s.currentStep);
  const isSubmitted = useAppStore((s) => s.isSubmitted);
  const setAppParam = useAppStore((s) => s.setAppParam);
  const setUtm = useAppStore((s) => s.setUtm);
  const setUnderwriting = useAppStore((s) => s.setUnderwriting);
  const updateFormData = useAppStore((s) => s.updateFormData);
  const viewedSteps = useRef(new Set<number>());

  // Resolve safe attribution before applying and removing PII-prefill parameters.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const attribution = resolveAttribution(params, window.localStorage);
    setAppParam(attribution.values.app ?? null);
    setUtm({
      utm_source: attribution.values.utm_source ?? null,
      utm_medium: attribution.values.utm_medium ?? null,
      utm_campaign: attribution.values.utm_campaign ?? null,
      utm_term: attribution.values.utm_term ?? null,
      utm_content: attribution.values.utm_content ?? null,
      referrer: document.referrer || null,
    });

    const prefill = getUrlPrefill(
      params,
      useAppStore.getState().formData.physicalAddress,
    );
    if (Object.keys(prefill).length) updateFormData(prefill);

    // Hidden underwriting values (rep-supplied). Only overwrite session state
    // when the URL carries at least one, so a refresh after the URL has been
    // scrubbed keeps what was captured on first load.
    const underwriting = getUrlUnderwriting(params);
    if (hasUnderwritingValues(underwriting)) setUnderwriting(underwriting);

    const sanitizedParams = removeUrlUnderwritingParams(removeUrlPrefillParams(params));
    if (sanitizedParams.toString() !== params.toString()) {
      const query = sanitizedParams.toString();
      const sanitizedUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", sanitizedUrl);
    }

    analytics.setAttribution(attribution);
    analytics.initialize();
    setSpeedInsightsReady(true);
  }, [setAppParam, setUtm, setUnderwriting, updateFormData]);

  useEffect(() => {
    if (isSubmitted || viewedSteps.current.has(currentStep)) return;
    const stepName = STEP_NAMES[currentStep];
    if (!stepName) return;
    viewedSteps.current.add(currentStep);
    analytics.push("application_step_view", {
      step_number: currentStep + 1,
      step_name: stepName,
    });
  }, [currentStep, isSubmitted]);

  useEffect(() => {
    let wasHidden = false;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        wasHidden = true;
      } else if (wasHidden) {
        wasHidden = false;
        analytics.push("application_resume");
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const step = (() => {
    if (isSubmitted) return <Confirmation />;
    switch (currentStep) {
      case 0:
        return <ContactInfo />;
      case 1:
        return <BusinessInfo />;
      case 2:
        return <OwnershipDetails />;
      case 3:
        return <BankStatements />;
      case 4:
        return <SignSubmit />;
      default:
        return <ContactInfo />;
    }
  })();

  return (
    <>
      <Layout>
        {!isSubmitted && <Stepper />}
        <div
          key={isSubmitted ? "confirmation" : currentStep}
          className="animate-fadeIn"
          onChangeCapture={() => analytics.start()}
          onInputCapture={() => analytics.start()}
        >
          {step}
        </div>
      </Layout>
      {speedInsightsReady && <SpeedInsights />}
    </>
  );
}
