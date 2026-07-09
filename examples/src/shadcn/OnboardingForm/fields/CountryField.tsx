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
import { COUNTRY_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type CountryFieldProps = Readonly<{ label?: string }>;

export const useCountryField = () => useOnboardingField("address.country");

export const CountryField = ({ label = "Country" }: CountryFieldProps) => {
  const field = useCountryField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-address.country">{label}</Label>
      <Select {...shadcnSelectProps(field)}>
        <SelectTrigger
          id="onbsc-address.country"
          className="w-full"
          aria-invalid={ariaInvalid(field)}
        >
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {COUNTRY_OPTIONS.map((option) => (
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
