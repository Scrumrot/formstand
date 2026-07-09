import { Badge } from "../../ui/badge";
import { useOnboardingIsDirty, useOnboardingIsValid } from "../hooks";
import { LaptopField } from "../fields/LaptopField";
import { MonitorCountField } from "../fields/MonitorCountField";
import { NeedsPhoneField } from "../fields/NeedsPhoneField";
import { ShirtSizeField } from "../fields/ShirtSizeField";
import { NotesField } from "../fields/NotesField";

export type EquipmentSectionProps = Readonly<{ initiallyOpen?: boolean }>;

// The section hook is the path-scoped flags: dirty/valid for this subtree
// only, rendered as badges in the summary.
export const useEquipmentSection = () => ({
  dirty: useOnboardingIsDirty("equipment"),
  valid: useOnboardingIsValid("equipment"),
});

export const EquipmentSection = ({
  initiallyOpen = false,
}: EquipmentSectionProps) => {
  const { dirty, valid } = useEquipmentSection();
  return (
    <details className="rounded-lg border" open={initiallyOpen || undefined}>
      <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-medium">
        Equipment
        {dirty ? <Badge>edited</Badge> : null}
        {valid ? null : (
          <span className="text-xs text-destructive">needs attention</span>
        )}
      </summary>
      <div className="grid gap-4 px-4 pb-4">
        <LaptopField />
        <MonitorCountField />
        <NeedsPhoneField />
        <ShirtSizeField />
        <NotesField />
      </div>
    </details>
  );
};
