import { textInputProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type ManagerEmailFieldProps = Readonly<{ label?: string }>;

export const useManagerEmailField = () => useOnboardingField("employment.managerEmail");

export const ManagerEmailField = ({ label = "Manager's email" }: ManagerEmailFieldProps) => {
  const field = useManagerEmailField();
  return (
    <div className="field">
      <label>{label}</label>
      <input type="email" {...textInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
