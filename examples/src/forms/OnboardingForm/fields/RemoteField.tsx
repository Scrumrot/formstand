import { checkboxProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { useOnboardingField } from "../hooks";

export type RemoteFieldProps = Readonly<{ label?: string }>;

export const useRemoteField = () => useOnboardingField("employment.remote");

export const RemoteField = ({ label = "Fully remote" }: RemoteFieldProps) => {
  const field = useRemoteField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label className="row" style={{ gap: 8 }}>
        <input {...checkboxProps(field)} {...a11y.control} />
        {label}
      </label>
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
