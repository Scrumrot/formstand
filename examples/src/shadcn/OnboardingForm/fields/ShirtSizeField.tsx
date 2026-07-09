import { FieldError } from "../../FieldError";
import { ariaInvalid, shadcnSelectProps } from "../../shadcnAdapter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { Label } from "../../ui/label";
import { SHIRT_SIZE_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type ShirtSizeFieldProps = Readonly<{ label?: string }>;

export const useShirtSizeField = () => useOnboardingField("equipment.shirtSize");

export const ShirtSizeField = ({ label = "Shirt size" }: ShirtSizeFieldProps) => {
  const field = useShirtSizeField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-equipment.shirtSize">{label}</Label>
      <Select {...shadcnSelectProps(field)}>
        <SelectTrigger
          id="onbsc-equipment.shirtSize"
          className="w-full"
          aria-invalid={ariaInvalid(field)}
        >
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {SHIRT_SIZE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError field={field} />
    </div>
  );
};
