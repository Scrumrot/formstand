import { checkboxProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type RemoteFieldProps = Readonly<{ label?: string }>;

export const useRemoteField = () => useOnboardingField("employment.remote");

export const RemoteField = ({ label = "Fully remote" }: RemoteFieldProps) => {
  const field = useRemoteField();
  return (
    <div className="field">
      <label className="row" style={{ gap: 8 }}>
        <input {...checkboxProps(field)} />
        {label}
      </label>
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
