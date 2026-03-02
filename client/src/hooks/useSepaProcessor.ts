import { useState, useCallback } from "react";
import type { GeneratedFile, RoutedPayments, BankProfile } from "@/lib/sepa/models";
import { ValidationResult } from "@/lib/sepa/models";
import { PROFILES, getProfileByName } from "@/lib/sepa/profiles";
import { getSheetNames, readTransactions } from "@/lib/sepa/excelReader";
import { validateTransactions } from "@/lib/sepa/validator";
import { routePayments } from "@/lib/sepa/router";
import { generateXmlFiles } from "@/lib/sepa/generators";
import { validateXmlAgainstSchema } from "@/lib/sepa/schemaValidator";

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
    setState((prev) => ({ ...prev, isProcessing: true, error: null }));
    try {
      const data = await file.arrayBuffer();
      const sheets = await getSheetNames(data);

      setState((prev) => ({
        ...prev,
        file,
        fileData: data,
        availableSheets: sheets,
        selectedSheets: [],
        step: "configure",
        isProcessing: false,
        error: null,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
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

  const processFile = useCallback(async () => {
    // Capture current state
    let currentState: ProcessingState | null = null;
    setState((prev) => {
      currentState = prev;
      return { ...prev, isProcessing: true, error: null };
    });

    // Wait a tick for state to settle
    await new Promise((r) => setTimeout(r, 0));

    if (!currentState) return;
    const cs = currentState as ProcessingState;

    if (!cs.fileData || !cs.selectedProfile || cs.selectedSheets.length === 0) {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        error: "Please select a profile and at least one sheet.",
      }));
      return;
    }

    try {
      // Step 1: Read transactions (async - may need to clean file)
      const { transactions, validation: readValidation } = await readTransactions(
        cs.fileData,
        cs.selectedProfile,
        cs.selectedSheets
      );

      if (transactions.length === 0) {
        readValidation.addError("", 0, "File", "No valid transactions found in the selected sheets.");
        setState((prev) => ({
          ...prev,
          validation: readValidation,
          step: "preview",
          routedPayments: [],
          isProcessing: false,
        }));
        return;
      }

      // Step 2: Validate transactions
      const { valid, validation } = validateTransactions(
        transactions,
        cs.selectedProfile,
        readValidation
      );

      // Step 3: Route payments
      const routed = routePayments(valid, cs.selectedProfile);

      setState((prev) => ({
        ...prev,
        routedPayments: routed,
        validation,
        step: "preview",
        isProcessing: false,
        error: null,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        error: `Processing failed: ${err instanceof Error ? err.message : String(err)}`,
      }));
    }
  }, []);

  const generateFiles = useCallback(() => {
    setState((prev) => {
      if (!prev.selectedProfile || prev.routedPayments.length === 0) {
        return { ...prev, error: "No routed payments to generate." };
      }

      try {
        const files = generateXmlFiles(prev.routedPayments, prev.selectedProfile);

        // Run XSD schema validation on each generated file
        const painVersion = prev.selectedProfile.painVersion;
        const validatedFiles = files.map((file) => {
          const result = validateXmlAgainstSchema(
            file.xmlContent,
            painVersion,
            file.paymentType,
          );
          return {
            ...file,
            schemaValidation: result,
          };
        });

        return {
          ...prev,
          generatedFiles: validatedFiles,
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
