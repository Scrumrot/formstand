import { textInputProps } from "formstand";
import { FieldError } from "../../FieldError";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type JobTitleFieldProps = Readonly<{ label?: string }>;

export const useJobTitleField = () => useOnboardingField("employment.jobTitle");

export const JobTitleField = ({ label = "Job title" }: JobTitleFieldProps) => {
  const field = useJobTitleField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-employment.jobTitle">{label}</Label>
      <Input id="onbsc-employment.jobTitle" {...textInputProps(field)} />
      <FieldError field={field} />
    </div>
  );
};
