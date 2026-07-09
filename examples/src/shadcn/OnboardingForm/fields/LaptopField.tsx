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
import { LAPTOP_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type LaptopFieldProps = Readonly<{ label?: string }>;

export const useLaptopField = () => useOnboardingField("equipment.laptop");

export const LaptopField = ({ label = "Laptop" }: LaptopFieldProps) => {
  const field = useLaptopField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-equipment.laptop">{label}</Label>
      <Select {...shadcnSelectProps(field)}>
        <SelectTrigger
          id="onbsc-equipment.laptop"
          className="w-full"
          aria-invalid={ariaInvalid(field)}
        >
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {LAPTOP_OPTIONS.map((option) => (
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
