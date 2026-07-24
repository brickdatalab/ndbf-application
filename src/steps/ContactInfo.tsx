import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { useAppStore } from "../store";
import { FormField } from "../components/ui/FormField";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { formatPhone, isValidEmail } from "../lib/utils";
import { analytics } from "../lib/analytics";

export function ContactInfo() {
  const { contactName, contactEmail, contactPhone } = useAppStore(
    (s) => s.formData
  );
  const update = useAppStore((s) => s.updateFormData);
  const next = useAppStore((s) => s.nextStep);
  const [touched, setTouched] = useState<{ email?: boolean }>({});

  const emailInvalid = touched.email && !isValidEmail(contactEmail);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(contactEmail)) {
      setTouched({ email: true });
      analytics.push("application_validation_error", {
        step_number: 1,
        step_name: "contact_information",
        error_category: "invalid_email",
      });
      return;
    }
    analytics.push("application_step_complete", {
      step_number: 1,
      step_name: "contact_information",
    });
    next();
  };

  return (
    <form
      onSubmit={handleSubmit}
      onInvalidCapture={() =>
        analytics.push("application_validation_error", {
          step_number: 1,
          step_name: "contact_information",
          error_category: "invalid_contact_information",
        })
      }
      className="space-y-6 md:space-y-8"
    >
      <header className="text-center space-y-2">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-brand-navy">
          Primary Contact Information
        </h2>
        <p className="text-sm md:text-base text-ink-muted max-w-2xl mx-auto">
          Please provide your contact information. This will be used as the primary
          contact for your application, and you'll receive a confirmation email once you
          submit the form.
        </p>
      </header>

      <div className="max-w-xl mx-auto space-y-5">
        <FormField label="Full Name" required htmlFor="contactName">
          <Input
            id="contactName"
            name="contactName"
            value={contactName}
            onChange={(e) => update({ contactName: e.target.value })}
            required
            placeholder="Enter your full name"
          />
        </FormField>

        <FormField
          label="Email Address"
          required
          htmlFor="contactEmail"
          tooltip="We'll send application confirmation and important updates to this email."
          error={emailInvalid ? "Please enter a valid email address" : null}
        >
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            value={contactEmail}
            onChange={(e) => update({ contactEmail: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            required
            placeholder="Enter your email address"
          />
        </FormField>

        <FormField
          label="Phone Number"
          required
          htmlFor="contactPhone"
          tooltip="Enter a phone number where you can be reached."
        >
          <Input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            value={contactPhone}
            onChange={(e) => update({ contactPhone: formatPhone(e.target.value) })}
            required
            placeholder="(XXX) XXX-XXXX"
          />
        </FormField>
      </div>

      <div className="flex justify-end pt-4 border-t border-divider-soft">
        <Button type="submit" size="lg">
          Continue <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
