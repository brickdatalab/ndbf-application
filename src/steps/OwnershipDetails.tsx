import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, User } from "lucide-react";
import { useAppStore } from "../store";
import { FormField } from "../components/ui/FormField";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { AddressAutocomplete } from "../components/AddressAutocomplete";
import { DatePicker } from "../components/DatePicker";
import { formatSSN } from "../lib/utils";

export function OwnershipDetails() {
  const owner = useAppStore((s) => s.formData.owner);
  const updateOwner = useAppStore((s) => s.updateOwner);
  const next = useAppStore((s) => s.nextStep);
  const prev = useAppStore((s) => s.prevStep);
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    if (!owner.dateOfBirth) e.dateOfBirth = "Required";
    if (!owner.address.street) e.address = "Please select your home address";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    if (validate()) next();
  };

  // Ensure DOB is at least 18 years ago and not in the future
  const currentYear = new Date().getFullYear();

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
                      e.target.value === "" ? "" : Math.max(0, Math.min(100, Number(e.target.value))),
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

          <FormField
            label="Date of Birth"
            required
            htmlFor="dob"
            error={errors.dateOfBirth}
          >
            <DatePicker
              id="dob"
              value={owner.dateOfBirth}
              onChange={(iso) => updateOwner({ dateOfBirth: iso })}
              minYear={currentYear - 100}
              maxYear={currentYear - 18}
              placeholder="Select date of birth"
            />
          </FormField>
        </div>

        <FormField
          label="Home Address"
          required
          htmlFor="ownerAddress"
          help="Start typing and select your address from the list."
          error={errors.address}
        >
          <AddressAutocomplete
            id="ownerAddress"
            value={owner.address}
            onChange={(a) => updateOwner({ address: a })}
            placeholder="123 Main St, New York, NY 10001"
          />
        </FormField>
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
