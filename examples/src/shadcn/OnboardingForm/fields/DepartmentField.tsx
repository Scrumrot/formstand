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
import { DEPARTMENT_OPTIONS } from "../schema";
import { useOnboardingField } from "../hooks";

export type DepartmentFieldProps = Readonly<{ label?: string }>;

export const useDepartmentField = () => useOnboardingField("employment.department");

export const DepartmentField = ({ label = "Department" }: DepartmentFieldProps) => {
  const field = useDepartmentField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-employment.department">{label}</Label>
      <Select {...shadcnSelectProps(field)}>
        <SelectTrigger
          id="onbsc-employment.department"
          className="w-full"
          aria-invalid={ariaInvalid(field)}
        >
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {DEPARTMENT_OPTIONS.map((option) => (
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
