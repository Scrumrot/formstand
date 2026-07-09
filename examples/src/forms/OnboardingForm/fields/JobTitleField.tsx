import { textInputProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type JobTitleFieldProps = Readonly<{ label?: string }>;

export const useJobTitleField = () => useOnboardingField("employment.jobTitle");

export const JobTitleField = ({ label = "Job title" }: JobTitleFieldProps) => {
  const field = useJobTitleField();
  return (
    <div className="field">
      <label>{label}</label>
      <input {...textInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
