import { TextField } from "@mui/material";
import { muiNumberFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type MonitorCountFieldProps = Readonly<{ label?: string }>;

export const useMonitorCountField = () => useOnboardingField("equipment.monitorCount");

export const MonitorCountField = ({ label = "External monitors (0-4)" }: MonitorCountFieldProps) => {
  const field = useMonitorCountField();
  return <TextField fullWidth label={label} {...muiNumberFieldProps(field)} />;
};
