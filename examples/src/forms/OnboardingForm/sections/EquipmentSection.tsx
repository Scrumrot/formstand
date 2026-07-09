import { useOnboardingIsDirty, useOnboardingIsValid } from "../hooks";
import { LaptopField } from "../fields/LaptopField";
import { MonitorCountField } from "../fields/MonitorCountField";
import { NeedsPhoneField } from "../fields/NeedsPhoneField";
import { ShirtSizeField } from "../fields/ShirtSizeField";
import { NotesField } from "../fields/NotesField";

export type EquipmentSectionProps = Readonly<{ initiallyOpen?: boolean }>;

// The section hook is just the path-scoped flags: dirty/valid for this
// subtree only, as boolean-only subscriptions.
export const useEquipmentSection = () => ({
  dirty: useOnboardingIsDirty("equipment"),
  valid: useOnboardingIsValid("equipment"),
});

export const EquipmentSection = ({
  initiallyOpen = false,
}: EquipmentSectionProps) => {
  const { dirty, valid } = useEquipmentSection();
  return (
    <details open={initiallyOpen || undefined}>
      <summary style={{ cursor: "pointer", marginBottom: 8 }}>
        <strong>Equipment</strong>{" "}
        {dirty ? <span className="pending">edited</span> : null}{" "}
        {valid ? null : <span className="error">needs attention</span>}
      </summary>
      <LaptopField />
      <MonitorCountField />
      <NeedsPhoneField />
      <ShirtSizeField />
      <NotesField />
    </details>
  );
};
