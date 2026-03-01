import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { BankProfile } from "@/lib/sepa/models";
import { FileSpreadsheet, ArrowRight, Info } from "lucide-react";

interface ConfigureStepProps {
  file: File | null;
  profiles: BankProfile[];
  selectedProfile: BankProfile | null;
  availableSheets: string[];
  selectedSheets: string[];
  onProfileChange: (profileName: string) => void;
  onSheetsChange: (sheets: string[]) => void;
  onProcess: () => void;
  error: string | null;
}

export function ConfigureStep({
  file,
  profiles,
  selectedProfile,
  availableSheets,
  selectedSheets,
  onProfileChange,
  onSheetsChange,
  onProcess,
  error,
}: ConfigureStepProps) {
  const isMultiSheet = selectedProfile?.isMultiSheet ?? false;
  const canProcess = selectedProfile && selectedSheets.length > 0;

  const handleSheetToggle = (sheet: string, checked: boolean) => {
    if (isMultiSheet) {
      if (checked) {
        onSheetsChange([...selectedSheets, sheet]);
      } else {
        onSheetsChange(selectedSheets.filter((s) => s !== sheet));
      }
    } else {
      onSheetsChange(checked ? [sheet] : []);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Configure Export</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select the bank profile and worksheet(s) to process.
        </p>
      </div>

      {/* File info */}
      {file && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-foreground font-medium">{file.name}</span>
          <span className="text-xs text-muted-foreground">
            ({availableSheets.length} sheet{availableSheets.length !== 1 ? "s" : ""})
          </span>
        </div>
      )}

      {/* Bank Profile Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Bank Profile</Label>
        <Select
          value={selectedProfile?.profileName ?? ""}
          onValueChange={onProfileChange}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a bank profile..." />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p.profileName} value={p.profileName}>
                {p.profileName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Profile details */}
      {selectedProfile && (
        <div className="p-4 bg-card border border-border rounded-lg space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Info className="w-4 h-4 text-primary" />
            Profile Details
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Bank:</span>{" "}
              <span className="font-medium">{selectedProfile.bank === "abnamro" ? "ABN AMRO" : "RBS/NatWest"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Format:</span>{" "}
              <span className="font-data">{selectedProfile.painVersion}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Processing:</span>{" "}
              <span className="font-medium">{selectedProfile.useIndividualProcessing ? "Individual" : "Batch"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Debtor BIC:</span>{" "}
              <span className="font-data">{selectedProfile.defaultDebtorBic}</span>
            </div>
          </div>
        </div>
      )}

      {/* Sheet Selection */}
      {selectedProfile && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            {isMultiSheet ? "Select Sheets" : "Worksheet"}
          </Label>
          {isMultiSheet && (
            <p className="text-xs text-muted-foreground">
              This profile supports multi-sheet processing. Select one or more sheets.
            </p>
          )}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {availableSheets.map((sheet) => {
              const isSelected = selectedSheets.includes(sheet);
              return (
                <label
                  key={sheet}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-150
                    ${isSelected
                      ? "border-primary/40 bg-primary/5"
                      : "border-border hover:border-primary/20 hover:bg-muted/30"
                    }
                  `}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked) => handleSheetToggle(sheet, !!checked)}
                  />
                  <span className="text-sm font-medium">{sheet}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Process button */}
      <Button
        onClick={onProcess}
        disabled={!canProcess}
        className="w-full"
        size="lg"
      >
        Process File
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}
