import { textInputProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { useOnboardingField } from "../hooks";

export type ManagerEmailFieldProps = Readonly<{ label?: string }>;

export const useManagerEmailField = () => useOnboardingField("employment.managerEmail");

export const ManagerEmailField = ({ label = "Manager's email" }: ManagerEmailFieldProps) => {
  const field = useManagerEmailField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input type="email" {...textInputProps(field)} {...a11y.control} />
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
