import { numberInputProps } from "formstand";
import { useOnboardingField } from "../hooks";

export type MonitorCountFieldProps = Readonly<{ label?: string }>;

export const useMonitorCountField = () => useOnboardingField("equipment.monitorCount");

export const MonitorCountField = ({ label = "External monitors (0-4)" }: MonitorCountFieldProps) => {
  const field = useMonitorCountField();
  return (
    <div className="field">
      <label htmlFor={field.path}>{label}</label>
      <input id={field.path} {...numberInputProps(field)} />
      <span className="error">{field.error?.[0] ?? " "}</span>
    </div>
  );
};
