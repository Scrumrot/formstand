import { FieldError } from "../../FieldError";
import { shadcnCheckboxProps } from "../../shadcnAdapter";
import { Checkbox } from "../../ui/checkbox";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type NeedsPhoneFieldProps = Readonly<{ label?: string }>;

export const useNeedsPhoneField = () => useOnboardingField("equipment.needsPhone");

export const NeedsPhoneField = ({ label = "Company phone needed" }: NeedsPhoneFieldProps) => {
  const field = useNeedsPhoneField();
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Checkbox id="onbsc-equipment.needsPhone" {...shadcnCheckboxProps(field)} />
        <Label htmlFor="onbsc-equipment.needsPhone">{label}</Label>
      </div>
      <FieldError field={field} />
    </div>
  );
};
