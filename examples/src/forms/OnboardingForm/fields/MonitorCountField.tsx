import { numberInputProps } from "formstand";
import { fieldA11y } from "../../fieldA11y";
import { useOnboardingField } from "../hooks";

export type MonitorCountFieldProps = Readonly<{ label?: string }>;

export const useMonitorCountField = () => useOnboardingField("equipment.monitorCount");

export const MonitorCountField = ({ label = "External monitors (0-4)" }: MonitorCountFieldProps) => {
  const field = useMonitorCountField();
  const a11y = fieldA11y(field, field.path);
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input {...numberInputProps(field)} {...a11y.control} />
      <span {...a11y.message}>{field.error?.[0] ?? " "}</span>
    </div>
  );
};
