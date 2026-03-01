import { useState, useCallback } from "react";
import type { GeneratedFile, RoutedPayments, BankProfile } from "@/lib/sepa/models";
import { ValidationResult } from "@/lib/sepa/models";
import { PROFILES, getProfileByName } from "@/lib/sepa/profiles";
import { getSheetNames, readTransactions } from "@/lib/sepa/excelReader";
import { validateTransactions } from "@/lib/sepa/validator";
import { routePayments } from "@/lib/sepa/router";
import { generateXmlFiles } from "@/lib/sepa/generators";

export type ProcessingStep = "upload" | "configure" | "preview" | "results";

export interface ProcessingState {
  step: ProcessingStep;
  file: File | null;
  fileData: ArrayBuffer | null;
  selectedProfile: BankProfile | null;
  availableSheets: string[];
  selectedSheets: string[];
  routedPayments: RoutedPayments[];
  validation: ValidationResult;
  generatedFiles: GeneratedFile[];
  isProcessing: boolean;
  error: string | null;
}

const initialState: ProcessingState = {
  step: "upload",
  file: null,
  fileData: null,
  selectedProfile: null,
  availableSheets: [],
  selectedSheets: [],
  routedPayments: [],
  validation: new ValidationResult(),
  generatedFiles: [],
  isProcessing: false,
  error: null,
};

export function useSepaProcessor() {
  const [state, setState] = useState<ProcessingState>(initialState);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const setFile = useCallback(async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const sheets = getSheetNames(data);

      setState((prev) => ({
        ...prev,
        file,
        fileData: data,
        availableSheets: sheets,
        selectedSheets: [],
        step: "configure",
        error: null,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
      }));
    }
  }, []);

  const setProfile = useCallback((profileName: string) => {
    const profile = getProfileByName(profileName);
    if (!profile) return;

    setState((prev) => {
      // Auto-select sheets based on profile
      let autoSelectedSheets: string[] = [];
      if (!profile.isMultiSheet && profile.sheetName) {
        // Single sheet profile: auto-select the matching sheet
        const match = prev.availableSheets.find(
          (s) => s.toLowerCase() === profile.sheetName!.toLowerCase()
        );
        autoSelectedSheets = match ? [match] : [];
      }

      return {
        ...prev,
        selectedProfile: profile,
        selectedSheets: autoSelectedSheets,
        error: null,
      };
    });
  }, []);

  const setSelectedSheets = useCallback((sheets: string[]) => {
    setState((prev) => ({ ...prev, selectedSheets: sheets }));
  }, []);

  const processFile = useCallback(() => {
    setState((prev) => {
      if (!prev.fileData || !prev.selectedProfile || prev.selectedSheets.length === 0) {
        return { ...prev, error: "Please select a profile and at least one sheet." };
      }

      try {
        // Step 1: Read transactions
        const { transactions, validation: readValidation } = readTransactions(
          prev.fileData,
          prev.selectedProfile,
          prev.selectedSheets
        );

        if (transactions.length === 0) {
          readValidation.addError("", 0, "File", "No valid transactions found in the selected sheets.");
          return {
            ...prev,
            validation: readValidation,
            step: "preview",
            routedPayments: [],
          };
        }

        // Step 2: Validate transactions
        const { valid, validation } = validateTransactions(
          transactions,
          prev.selectedProfile,
          readValidation
        );

        // Step 3: Route payments
        const routed = routePayments(valid, prev.selectedProfile);

        return {
          ...prev,
          routedPayments: routed,
          validation,
          step: "preview",
          error: null,
        };
      } catch (err) {
        return {
          ...prev,
          error: `Processing failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    });
  }, []);

  const generateFiles = useCallback(() => {
    setState((prev) => {
      if (!prev.selectedProfile || prev.routedPayments.length === 0) {
        return { ...prev, error: "No routed payments to generate." };
      }

      try {
        const files = generateXmlFiles(prev.routedPayments, prev.selectedProfile);

        return {
          ...prev,
          generatedFiles: files,
          step: "results",
          error: null,
        };
      } catch (err) {
        return {
          ...prev,
          error: `Generation failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    });
  }, []);

  const goToStep = useCallback((step: ProcessingStep) => {
    setState((prev) => ({ ...prev, step, error: null }));
  }, []);

  return {
    state,
    profiles: PROFILES,
    reset,
    setFile,
    setProfile,
    setSelectedSheets,
    processFile,
    generateFiles,
    goToStep,
  };
}
