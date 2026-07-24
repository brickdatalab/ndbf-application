import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, User } from "lucide-react";
import { useAppStore } from "../store";
import { FormField } from "../components/ui/FormField";
import { Input, Select } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { DOBPicker } from "../components/DOBPicker";
import { US_STATES } from "../lib/constants";
import { formatSSN } from "../lib/utils";
import { analytics } from "../lib/analytics";

export function OwnershipDetails() {
  const owner = useAppStore((s) => s.formData.owner);
  const contactName = useAppStore((s) => s.formData.contactName);
  const updateOwner = useAppStore((s) => s.updateOwner);
  const next = useAppStore((s) => s.nextStep);
  const prev = useAppStore((s) => s.prevStep);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Pre-fill the owner's full name from the contact step if it isn't set yet.
  // Still editable — we only set it if owner.fullName is empty so we don't clobber edits.
  useEffect(() => {
    if (!owner.fullName && contactName) {
      updateOwner({ fullName: contactName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!owner.fullName) e.fullName = "Required";
    const pct = Number(owner.ownershipPercentage);
    if (!owner.ownershipPercentage || Number.isNaN(pct) || pct < 1 || pct > 100) {
      e.ownershipPercentage = "Enter a value between 1 and 100";
    }
    if (!/^\d{3}-\d{2}-\d{4}$/.test(owner.ssn)) {
      e.ssn = "Must be in XXX-XX-XXXX format";
    }
    if (!owner.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(owner.dateOfBirth)) {
      e.dateOfBirth = "Select your date of birth";
    }
    if (!owner.address.street) e.street = "Required";
    if (!owner.address.city) e.city = "Required";
    if (!owner.address.state) e.state = "Required";
    if (!/^\d{5}$/.test(owner.address.zip)) e.zip = "Must be a 5-digit ZIP";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    if (validate()) {
      analytics.push("application_step_complete", {
        step_number: 3,
        step_name: "ownership_details",
      });
      next();
    } else {
      analytics.push("application_validation_error", {
        step_number: 3,
        step_name: "ownership_details",
        error_category: "invalid_ownership_details",
      });
    }
  };

  const updateOwnerAddress = (patch: Partial<typeof owner.address>) =>
    updateOwner({ address: { ...owner.address, ...patch } });

  return (
    <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
      <header className="text-center space-y-2">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-brand-navy">
          Ownership Details
        </h2>
        <p className="text-sm md:text-base text-ink-muted max-w-2xl mx-auto">
          Please provide information about owners with 20% or more ownership in the
          business.
        </p>
      </header>

      <div className="rounded-2xl border border-divider-soft bg-surface-offWhite/60 p-5 md:p-7 space-y-5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-full bg-brand-blue/10 text-brand-blue flex items-center justify-center">
            <User className="h-4 w-4" />
          </div>
          <h3 className="font-display font-semibold text-brand-navy text-lg">
            Primary Owner (Your Information)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormField
            label="Full Name"
            required
            htmlFor="ownerFullName"
            error={errors.fullName}
          >
            <Input
              id="ownerFullName"
              value={owner.fullName}
              onChange={(e) => updateOwner({ fullName: e.target.value })}
              placeholder="Enter owner's full name"
              autoComplete="name"
            />
          </FormField>

          <FormField
            label="Ownership Percentage"
            required
            htmlFor="ownershipPercentage"
            tooltip="Enter the percentage of the business owned by this person."
            error={errors.ownershipPercentage}
          >
            <div className="relative">
              <Input
                id="ownershipPercentage"
                type="number"
                min={1}
                max={100}
                value={owner.ownershipPercentage === "" ? "" : owner.ownershipPercentage}
                onChange={(e) =>
                  updateOwner({
                    ownershipPercentage:
                      e.target.value === ""
                        ? ""
                        : Math.max(0, Math.min(100, Number(e.target.value))),
                  })
                }
                placeholder="Enter percentage"
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted font-medium pointer-events-none">
                %
              </span>
            </div>
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormField
            label="Social Security Number"
            required
            htmlFor="ssn"
            tooltip="Your 9-digit SSN in XXX-XX-XXXX format. Used for identity verification only."
            error={errors.ssn}
          >
            <Input
              id="ssn"
              value={owner.ssn}
              onChange={(e) => updateOwner({ ssn: formatSSN(e.target.value) })}
              placeholder="XXX-XX-XXXX"
              maxLength={11}
              autoComplete="off"
            />
          </FormField>

          <FormField label="Date of Birth" required error={errors.dateOfBirth}>
            <DOBPicker
              value={owner.dateOfBirth}
              onChange={(iso) => updateOwner({ dateOfBirth: iso })}
            />
          </FormField>
        </div>

        {/* Home address — four discrete fields, matching Step 2's address layout */}
        <div className="space-y-3">
          <div className="flex items-baseline gap-1.5">
            <label className="text-sm font-semibold text-brand-navy">Home Address</label>
            <span className="text-red-500">*</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Input
                placeholder="Street Address"
                value={owner.address.street}
                onChange={(e) => updateOwnerAddress({ street: e.target.value })}
                autoComplete="street-address"
              />
              {errors.street && (
                <p className="text-xs text-red-500 mt-1.5">{errors.street}</p>
              )}
            </div>
            <div>
              <Input
                placeholder="City"
                value={owner.address.city}
                onChange={(e) => updateOwnerAddress({ city: e.target.value })}
                autoComplete="address-level2"
              />
              {errors.city && (
                <p className="text-xs text-red-500 mt-1.5">{errors.city}</p>
              )}
            </div>
            <div>
              <Select
                placeholder="Select State"
                value={owner.address.state}
                onChange={(e) => updateOwnerAddress({ state: e.target.value })}
                aria-label="State"
              >
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              {errors.state && (
                <p className="text-xs text-red-500 mt-1.5">{errors.state}</p>
              )}
            </div>
            <div>
              <Input
                placeholder="ZIP Code"
                inputMode="numeric"
                maxLength={5}
                value={owner.address.zip}
                onChange={(e) =>
                  updateOwnerAddress({
                    zip: e.target.value.replace(/\D/g, "").slice(0, 5),
                  })
                }
                autoComplete="postal-code"
              />
              {errors.zip && <p className="text-xs text-red-500 mt-1.5">{errors.zip}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row-reverse sm:justify-between gap-3 pt-4 border-t border-divider-soft">
        <Button type="submit" size="lg">
          Continue <ArrowRight className="h-4 w-4" />
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={prev}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>
    </form>
  );
}
