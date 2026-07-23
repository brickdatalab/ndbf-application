import { useEffect, useState } from "react";
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

export default function App() {
  const [speedInsightsReady, setSpeedInsightsReady] = useState(false);
  const currentStep = useAppStore((s) => s.currentStep);
  const isSubmitted = useAppStore((s) => s.isSubmitted);
  const setAppParam = useAppStore((s) => s.setAppParam);
  const setUtm = useAppStore((s) => s.setUtm);
  const updateFormData = useAppStore((s) => s.updateFormData);

  // Capture attribution and direct field-prefill parameters on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const app = params.get("app");
    setAppParam(app);
    setUtm({
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
      utm_term: params.get("utm_term"),
      utm_content: params.get("utm_content"),
      referrer: document.referrer || null,
    });

    const prefill = getUrlPrefill(params);
    if (Object.keys(prefill).length) updateFormData(prefill);

    const sanitizedParams = removeUrlPrefillParams(params);
    if (sanitizedParams.toString() !== params.toString()) {
      const query = sanitizedParams.toString();
      const sanitizedUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", sanitizedUrl);
    }

    setSpeedInsightsReady(true);
  }, [setAppParam, setUtm, updateFormData]);

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
        <div key={isSubmitted ? "confirmation" : currentStep} className="animate-fadeIn">
          {step}
        </div>
      </Layout>
      {speedInsightsReady && <SpeedInsights />}
    </>
  );
}
