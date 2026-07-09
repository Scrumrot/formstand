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
import { EMPLOYMENT_TYPE_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type EmploymentTypeFieldProps = Readonly<{ label?: string }>;

export const useEmploymentTypeField = () => useOnboardingField("employment.employmentType");

export const EmploymentTypeField = ({ label = "Employment type" }: EmploymentTypeFieldProps) => {
  const field = useEmploymentTypeField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-employment.employmentType">{label}</Label>
      <Select {...shadcnSelectProps(field)}>
        <SelectTrigger
          id="onbsc-employment.employmentType"
          className="w-full"
          aria-invalid={ariaInvalid(field)}
        >
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
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
