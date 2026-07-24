import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useAppStore } from "../store";
import { FormField } from "../components/ui/FormField";
import { Input, Select } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { MonthYearPicker } from "../components/MonthYearPicker";
import {
  BUSINESS_ENTITY_TYPES,
  INDUSTRIES,
  SALES_BUCKETS,
  US_STATES,
} from "../lib/constants";
import {
  cleanCurrencyInput,
  formatEIN,
  formatUSD,
} from "../lib/utils";
import { analytics } from "../lib/analytics";

export function BusinessInfo() {
  const f = useAppStore((s) => s.formData);
  const update = useAppStore((s) => s.updateFormData);
  const next = useAppStore((s) => s.nextStep);
  const prev = useAppStore((s) => s.prevStep);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!f.businessLegalName) e.businessLegalName = "Required";
    if (!f.physicalAddress.street) e.street = "Required";
    if (!f.physicalAddress.city) e.city = "Required";
    if (!f.physicalAddress.state) e.state = "Required";
    if (!/^\d{5}$/.test(f.physicalAddress.zip)) {
      e.zip = "Must be a 5-digit ZIP";
    }
    if (!f.industry) e.industry = "Required";
    if (f.industry === "Other" && !f.industryOther) {
      e.industryOther = "Please specify your industry";
    }
    if (!f.stateOfIncorporation) e.stateOfIncorporation = "Required";
    if (!f.businessStartedMonth || !f.businessStartedYear) {
      e.businessStarted = "Select a month and year";
    }
    if (!/^\d{2}-\d{7}$/.test(f.federalTaxId)) {
      e.federalTaxId = "Must be in XX-XXXXXXX format";
    }
    if (!f.businessEntityType) e.businessEntityType = "Required";
    if (!f.grossAnnualSalesBucket) e.grossAnnualSalesBucket = "Required";
    if (!f.requestedFundingAmount || Number(f.requestedFundingAmount) <= 0) {
      e.requestedFundingAmount = "Enter an amount greater than $0";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    if (validate()) {
      analytics.push("application_step_complete", {
        step_number: 2,
        step_name: "business_information",
      });
      next();
    } else {
      analytics.push("application_validation_error", {
        step_number: 2,
        step_name: "business_information",
        error_category: "invalid_business_information",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
      <header className="text-center space-y-2">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-brand-navy">
          Business Information
        </h2>
        <p className="text-sm md:text-base text-ink-muted">
          Tell us about your business.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField
          label="Legal Business Name"
          required
          htmlFor="businessLegalName"
          error={errors.businessLegalName}
        >
          <Input
            id="businessLegalName"
            value={f.businessLegalName}
            onChange={(e) => update({ businessLegalName: e.target.value })}
            placeholder="Enter legal business name"
          />
        </FormField>

        <FormField
          label="Doing Business As (DBA)"
          htmlFor="dba"
          tooltip="Enter a DBA only if it differs from your legal business name."
        >
          <Input
            id="dba"
            value={f.dba}
            onChange={(e) => update({ dba: e.target.value })}
            placeholder="Enter DBA (if applicable)"
          />
        </FormField>
      </div>

      {/* Physical Address */}
      <div className="space-y-3">
        <div className="flex items-baseline gap-1.5">
          <label className="text-sm font-semibold text-brand-navy">
            Physical Address
          </label>
          <span className="text-red-500">*</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Input
              placeholder="Street Address"
              value={f.physicalAddress.street}
              onChange={(e) =>
                update({
                  physicalAddress: { ...f.physicalAddress, street: e.target.value },
                })
              }
            />
            {errors.street && (
              <p className="text-xs text-red-500 mt-1.5">{errors.street}</p>
            )}
          </div>
          <div>
            <Input
              placeholder="City"
              value={f.physicalAddress.city}
              onChange={(e) =>
                update({
                  physicalAddress: { ...f.physicalAddress, city: e.target.value },
                })
              }
            />
            {errors.city && <p className="text-xs text-red-500 mt-1.5">{errors.city}</p>}
          </div>
          <div>
            <Select
              placeholder="Select State"
              value={f.physicalAddress.state}
              onChange={(e) =>
                update({
                  physicalAddress: { ...f.physicalAddress, state: e.target.value },
                })
              }
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
              value={f.physicalAddress.zip}
              onChange={(e) =>
                update({
                  physicalAddress: {
                    ...f.physicalAddress,
                    zip: e.target.value.replace(/\D/g, "").slice(0, 5),
                  },
                })
              }
            />
            {errors.zip && <p className="text-xs text-red-500 mt-1.5">{errors.zip}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField
          label="Industry Type"
          required
          htmlFor="industry"
          error={errors.industry}
        >
          <Select
            id="industry"
            placeholder="Select an industry"
            value={f.industry}
            onChange={(e) =>
              update({
                industry: e.target.value,
                industryOther: e.target.value === "Other" ? f.industryOther : "",
              })
            }
          >
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="State of Incorporation"
          required
          htmlFor="stateOfIncorporation"
          error={errors.stateOfIncorporation}
        >
          <Select
            id="stateOfIncorporation"
            placeholder="Select State"
            value={f.stateOfIncorporation}
            onChange={(e) => update({ stateOfIncorporation: e.target.value })}
          >
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      {/* Conditional "Other" industry */}
      {f.industry === "Other" && (
        <div className="animate-fadeIn">
          <FormField
            label="Please specify your industry"
            required
            htmlFor="industryOther"
            error={errors.industryOther}
          >
            <Input
              id="industryOther"
              value={f.industryOther}
              onChange={(e) => update({ industryOther: e.target.value })}
              placeholder="e.g. Aerospace parts manufacturing"
            />
          </FormField>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField
          label="Date Business Started"
          required
          error={errors.businessStarted}
        >
          <MonthYearPicker
            month={f.businessStartedMonth}
            year={f.businessStartedYear}
            onChange={(patch) =>
              update({
                businessStartedMonth:
                  patch.month ?? f.businessStartedMonth,
                businessStartedYear: patch.year ?? f.businessStartedYear,
              })
            }
          />
        </FormField>

        <FormField
          label="Federal Tax ID (EIN)"
          required
          htmlFor="federalTaxId"
          tooltip="Your 9-digit Federal Tax ID — format XX-XXXXXXX."
          error={errors.federalTaxId}
        >
          <Input
            id="federalTaxId"
            value={f.federalTaxId}
            onChange={(e) => update({ federalTaxId: formatEIN(e.target.value) })}
            placeholder="XX-XXXXXXX"
            maxLength={10}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <FormField
          label="Type of Business Entity"
          required
          htmlFor="businessEntityType"
          error={errors.businessEntityType}
        >
          <Select
            id="businessEntityType"
            placeholder="Select business entity type"
            value={f.businessEntityType}
            onChange={(e) => update({ businessEntityType: e.target.value })}
          >
            {BUSINESS_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="Gross Annual Sales"
          required
          htmlFor="grossAnnualSales"
          tooltip="Your business's total annual revenue before expenses."
          error={errors.grossAnnualSalesBucket}
        >
          <Select
            id="grossAnnualSales"
            placeholder="Select a range"
            value={f.grossAnnualSalesBucket}
            onChange={(e) => update({ grossAnnualSalesBucket: e.target.value })}
          >
            {SALES_BUCKETS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <div className="max-w-md">
        <FormField
          label="Requested Funding Amount"
          required
          htmlFor="requestedFundingAmount"
          tooltip="Enter the amount of funding you're requesting."
          error={errors.requestedFundingAmount}
        >
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted font-medium pointer-events-none">
              $
            </span>
            <Input
              id="requestedFundingAmount"
              inputMode="numeric"
              value={
                f.requestedFundingAmount
                  ? formatUSD(f.requestedFundingAmount).replace("$", "")
                  : ""
              }
              onChange={(e) =>
                update({ requestedFundingAmount: cleanCurrencyInput(e.target.value) })
              }
              placeholder="0"
              className="pl-8"
            />
          </div>
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
