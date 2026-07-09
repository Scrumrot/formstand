import { numberInputProps } from "formstand";
import { FieldError } from "../../FieldError";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { useOnboardingField } from "../hooks";

export type MonitorCountFieldProps = Readonly<{ label?: string }>;

export const useMonitorCountField = () => useOnboardingField("equipment.monitorCount");

export const MonitorCountField = ({ label = "External monitors (0-4)" }: MonitorCountFieldProps) => {
  const field = useMonitorCountField();
  return (
    <div className="grid gap-2">
      <Label htmlFor="onbsc-equipment.monitorCount">{label}</Label>
      <Input id="onbsc-equipment.monitorCount" {...numberInputProps(field)} />
      <FieldError field={field} />
    </div>
  );
};
