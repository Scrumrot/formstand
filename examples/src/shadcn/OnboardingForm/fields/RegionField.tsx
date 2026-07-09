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
import { REGION_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type RegionFieldProps = Readonly<{ label?: string }>;

export const useRegionField = () => useOnboardingField("address.region");

export const RegionField = ({ label = "Region" }: RegionFieldProps) => {
  const field = useRegionField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-address.region">{label}</Label>
      <Select {...shadcnSelectProps(field)}>
        <SelectTrigger
          id="onbsc-address.region"
          className="w-full"
          aria-invalid={ariaInvalid(field)}
        >
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {REGION_OPTIONS.map((option) => (
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
