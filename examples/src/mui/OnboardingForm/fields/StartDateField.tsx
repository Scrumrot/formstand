import { TextField } from "@mui/material";
import { muiTextFieldProps } from "../../muiAdapter";
import { useOnboardingField } from "../hooks";

export type StartDateFieldProps = Readonly<{ label?: string }>;

export const useStartDateField = () => useOnboardingField("employment.startDate");

export const StartDateField = ({ label = "Start date" }: StartDateFieldProps) => {
  const field = useStartDateField();
  return <TextField fullWidth type="date" slotProps={{ inputLabel: { shrink: true } }} label={label} {...muiTextFieldProps(field)} />;
};
