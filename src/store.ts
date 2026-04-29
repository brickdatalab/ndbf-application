import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Address = {
  street: string;
  city: string;
  state: string;
  zip: string;
};

export type Owner = {
  fullName: string;
  ownershipPercentage: number | "";
  ssn: string;
  dateOfBirth: string; // ISO date
  address: Address;
};

export type UtmParams = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
};

export type FormData = {
  // Part 1 — Contact
  contactName: string;
  contactEmail: string;
  contactPhone: string;

  // Part 2 — Business
  businessLegalName: string;
  dba: string;
  physicalAddress: Address;
  industry: string;
  industryOther: string;
  stateOfIncorporation: string;
  businessStartedMonth: string; // "1".."12"
  businessStartedYear: string;
  federalTaxId: string;
  businessEntityType: string;
  grossAnnualSalesBucket: string;
  requestedFundingAmount: string; // numeric string

  // Part 3 — Ownership
  owner: Owner;

  // Part 4 — Bank statements (File objects held in memory only)
  bankStatements: File[];

  // Part 5 — Signature
  signature: string; // base64 PNG data URL
  termsAccepted: boolean;
};

type AppState = {
  currentStep: number;
  totalSteps: number;
  isSubmitted: boolean;
  entryId: string | null;
  submittedAt: string | null;
  pdfDataUrl: string | null;
  appParam: string | null;
  utm: UtmParams;
  formData: FormData;

  setCurrentStep: (n: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (n: number) => void;
  updateFormData: (patch: Partial<FormData>) => void;
  updateOwner: (patch: Partial<Owner>) => void;
  addBankStatements: (files: File[]) => void;
  removeBankStatement: (idx: number) => void;
  setAppParam: (v: string | null) => void;
  setUtm: (v: UtmParams) => void;
  markSubmitted: (entryId: string, pdfDataUrl: string) => void;
  resetAll: () => void;
};

const emptyAddress: Address = { street: "", city: "", state: "", zip: "" };

const initialFormData: FormData = {
  contactName: "",
  contactEmail: "",
  contactPhone: "",

  businessLegalName: "",
  dba: "",
  physicalAddress: { ...emptyAddress },
  industry: "",
  industryOther: "",
  stateOfIncorporation: "",
  businessStartedMonth: "",
  businessStartedYear: "",
  federalTaxId: "",
  businessEntityType: "",
  grossAnnualSalesBucket: "",
  requestedFundingAmount: "",

  owner: {
    fullName: "",
    ownershipPercentage: "",
    ssn: "",
    dateOfBirth: "",
    address: { ...emptyAddress },
  },

  bankStatements: [],

  signature: "",
  termsAccepted: false,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentStep: 0,
      totalSteps: 5,
      isSubmitted: false,
      entryId: null,
      submittedAt: null,
      pdfDataUrl: null,
      appParam: null,
      utm: {
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_term: null,
        utm_content: null,
        referrer: null,
      },
      formData: initialFormData,

      setCurrentStep: (n) => set({ currentStep: n }),
      nextStep: () =>
        set((s) => ({ currentStep: Math.min(s.currentStep + 1, s.totalSteps - 1) })),
      prevStep: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 0) })),
      goToStep: (n) =>
        set((s) => ({ currentStep: Math.max(0, Math.min(n, s.totalSteps - 1)) })),
      updateFormData: (patch) =>
        set((s) => ({ formData: { ...s.formData, ...patch } })),
      updateOwner: (patch) =>
        set((s) => ({
          formData: { ...s.formData, owner: { ...s.formData.owner, ...patch } },
        })),
      addBankStatements: (files) =>
        set((s) => ({
          formData: {
            ...s.formData,
            bankStatements: [...s.formData.bankStatements, ...files].slice(0, 10),
          },
        })),
      removeBankStatement: (idx) =>
        set((s) => ({
          formData: {
            ...s.formData,
            bankStatements: s.formData.bankStatements.filter((_, i) => i !== idx),
          },
        })),
      setAppParam: (v) => set({ appParam: v }),
      setUtm: (v) => set({ utm: v }),
      markSubmitted: (entryId, pdfDataUrl) =>
        set({
          isSubmitted: true,
          entryId,
          submittedAt: new Date().toISOString(),
          pdfDataUrl,
        }),
      resetAll: () =>
        set({
          currentStep: 0,
          isSubmitted: false,
          entryId: null,
          submittedAt: null,
          pdfDataUrl: null,
          formData: initialFormData,
        }),
    }),
    {
      name: "ndbf-application-demo",
      // Files can't be serialized, and we don't want to persist signature/step-5 secrets.
      partialize: (s) => ({
        currentStep: s.currentStep,
        isSubmitted: s.isSubmitted,
        entryId: s.entryId,
        submittedAt: s.submittedAt,
        appParam: s.appParam,
        utm: s.utm,
        formData: {
          ...s.formData,
          bankStatements: [],
          signature: "",
        },
      }),
    }
  )
);
